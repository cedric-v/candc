import { html } from "../../_lib/http.js";
import { htmlDocument, escapeHtml } from "../../_lib/ui.js";
import { getManageText, localeFromAcceptLanguage } from "../../_lib/manage-i18n.js";
import { getReservationForManageToken } from "../../_lib/db.js";
import { sha256Hex } from "../../_lib/security.js";

export async function onRequestGet(context) {
  const token = context.params.token;

  // The reservation stores the locale chosen at booking time; render the page
  // in that language. Fall back to the visitor's Accept-Language header.
  let locale = null;
  try {
    const tokenHash = await sha256Hex(token);
    const reservation = await getReservationForManageToken(context.env, tokenHash);
    locale = reservation?.locale || null;
  } catch {
    // Keep going with the header fallback.
  }

  if (!locale) {
    locale = localeFromAcceptLanguage(context.request.headers.get("accept-language"));
  }

  const t = getManageText(locale);
  const textsForJs = JSON.stringify(t);

  const body = `
    <section class="hero">
      <h1>${escapeHtml(t.h1)}</h1>
      <p>${escapeHtml(t.intro)}</p>
    </section>
    <div class="grid cols-2">
      <section class="card stack">
        <h2>${escapeHtml(t.yourBooking)}</h2>
        <div id="manage-notice" class="notice info">${escapeHtml(t.loading)}</div>
        <div id="manage-meta" class="meta"></div>
        <form
          id="manage-form"
          class="stack"
          hidden
          toolname="update_existing_reservation"
          tooldescription="Update an existing reservation by changing stay dates, traveller counts, vehicle type for parking stays, WC-shower access, or remarks."
        >
          <div class="field-row two">
            <div class="field">
              <label for="checkInDate">${escapeHtml(t.arrivalDate)}</label>
              <input id="checkInDate" name="checkInDate" type="date" required toolparamdescription="Updated arrival date in YYYY-MM-DD format.">
            </div>
            <div class="field">
              <label for="checkOutDate">${escapeHtml(t.departureDate)}</label>
              <input id="checkOutDate" name="checkOutDate" type="date" required toolparamdescription="Updated departure date in YYYY-MM-DD format.">
            </div>
          </div>
          <div class="field-row four">
            <div class="field">
              <label for="adults">${escapeHtml(t.adults)}</label>
              <input id="adults" name="adults" type="number" min="1" required toolparamdescription="Updated number of adult travellers.">
            </div>
            <div class="field">
              <label for="children">${escapeHtml(t.children)}</label>
              <input id="children" name="children" type="number" min="0" required toolparamdescription="Updated number of children under 16 years old.">
            </div>
            <div class="field" id="infants-wrap">
              <label for="infants">${escapeHtml(t.infants)}</label>
              <input id="infants" name="infants" type="number" min="0" required toolparamdescription="Updated number of infants aged 0 to 2.">
            </div>
            <div class="field" id="vehicle-wrap">
              <label for="vehicleType">${escapeHtml(t.vehicle)}</label>
              <select id="vehicleType" name="vehicleType" toolparamdescription="Updated vehicle category for parking reservations.">
                <option value="standard_car">${escapeHtml(t.vehicleOptions.standard_car)}</option>
                <option value="car_roof_tent">${escapeHtml(t.vehicleOptions.car_roof_tent)}</option>
                <option value="van">${escapeHtml(t.vehicleOptions.van)}</option>
                <option value="caravan">${escapeHtml(t.vehicleOptions.caravan)}</option>
                <option value="motorhome_upto_6_5m">${escapeHtml(t.vehicleOptions.motorhome_upto_6_5m)}</option>
                <option value="motorhome_over_6_5m">${escapeHtml(t.vehicleOptions.motorhome_over_6_5m)}</option>
              </select>
            </div>
          </div>
          <label class="checkbox">
            <input id="wcShowerRequested" name="wcShowerRequested" type="checkbox" toolparamdescription="Set to true to add or keep indoor WC-shower access for the reservation.">
            <span>${escapeHtml(t.wcShower)}</span>
          </label>
          <div class="field">
            <label for="remarks">${escapeHtml(t.remarks)}</label>
            <textarea id="remarks" name="remarks" toolparamdescription="Updated remarks for the reservation."></textarea>
          </div>
          <div class="actions">
            <button class="btn-primary" type="button" id="pay-button" hidden>${escapeHtml(t.payNow)}</button>
            <button class="btn-secondary" type="button" id="preview-button">${escapeHtml(t.previewTotal)}</button>
            <button class="btn-primary" type="submit" id="update-button">${escapeHtml(t.saveChanges)}</button>
            <button class="btn-danger" type="button" id="cancel-button">${escapeHtml(t.cancelReservation)}</button>
          </div>
        </form>
      </section>
      <aside class="card stack">
        <h2>${escapeHtml(t.updatedPricing)}</h2>
        <div id="quote-notice" class="notice info">${escapeHtml(t.quoteNoticeDefault)}</div>
        <div id="quote-meta" class="meta"></div>
      </aside>
    </div>
    <script>
      (() => {
        const t = ${textsForJs};
        const locale = ${JSON.stringify(locale)};
        const token = ${JSON.stringify(token)};
        const apiUrl = '/api/booking/manage/' + encodeURIComponent(token);
        const notice = document.getElementById('manage-notice');
        const quoteNotice = document.getElementById('quote-notice');
        const meta = document.getElementById('manage-meta');
        const quoteMeta = document.getElementById('quote-meta');
        const form = document.getElementById('manage-form');
        const previewButton = document.getElementById('preview-button');
        const payButton = document.getElementById('pay-button');
        const cancelButton = document.getElementById('cancel-button');
        const vehicleWrap = document.getElementById('vehicle-wrap');
        const infantsWrap = document.getElementById('infants-wrap');
        let reservation = null;

        async function fetchJson(url, options) {
          const response = await fetch(url, options);
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.message || t.requestFailed);
          }
          return data;
        }

        function escapeHtml(value) {
          return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        }

        function safeHttpUrl(value) {
          try {
            const url = new URL(value);
            return (url.protocol === 'http:' || url.protocol === 'https:') ? value : '';
          } catch {
            return '';
          }
        }

        function setMeta(target, rows) {
          target.innerHTML = rows.map(function (row) {
            return '<div class="meta-row"><span class="label">' + escapeHtml(row[0]) + '</span><span class="value">' + escapeHtml(row[1]) + '</span></div>';
          }).join('');
        }

        function fillForm(data) {
          form.elements.checkInDate.value = data.checkInDate;
          form.elements.checkOutDate.value = data.checkOutDate;
          form.elements.adults.value = data.adults;
          form.elements.children.value = data.children;
          form.elements.infants.value = data.infants || 0;
          form.elements.vehicleType.value = data.vehicleType || 'van';
          form.elements.wcShowerRequested.checked = Boolean(data.wcShowerRequested);
          form.elements.remarks.value = data.remarks || '';
          vehicleWrap.hidden = data.unitType !== 'parking';
          infantsWrap.hidden = data.unitType !== 'studio';
        }

        function formatMoney(value, currency) {
          return new Intl.NumberFormat(t.localeTag, { style: 'currency', currency }).format(Number(value || 0));
        }

        async function loadReservation() {
          try {
            const data = await fetchJson(apiUrl);
            reservation = data.reservation;
            notice.className = 'notice info';
            notice.innerHTML = data.notices.length
              ? data.notices.map(function (item) { return '<div>' + escapeHtml(item) + '</div>'; }).join('')
              : escapeHtml(t.readyBelow);
            setMeta(meta, [
              [t.metaReference, reservation.publicReference],
              [t.metaUnit, reservation.unitDisplayName],
              [t.metaStatus, reservation.status],
              [t.metaPayment, reservation.paymentStatus || '-'],
              [t.metaGuest, reservation.guestFirstName + ' ' + reservation.guestLastName],
              [t.metaTotal, formatMoney(reservation.totalAmount, reservation.currency)],
            ]);
            fillForm(reservation);
            form.hidden = !data.permissions.canUpdate && !data.permissions.canCancel && !data.permissions.canResumePayment;
            previewButton.disabled = !data.permissions.canUpdate;
            form.querySelector('#update-button').disabled = !data.permissions.canUpdate;
            cancelButton.disabled = !data.permissions.canCancel;
            payButton.hidden = !data.permissions.canResumePayment;
          } catch (error) {
            notice.className = 'notice error';
            notice.textContent = error.message;
          }
        }

        function buildPayload(action) {
          return {
            action: action,
            checkInDate: form.elements.checkInDate.value,
            checkOutDate: form.elements.checkOutDate.value,
            adults: Number(form.elements.adults.value || 0),
            children: Number(form.elements.children.value || 0),
            infants: Number(form.elements.infants.value || 0),
            vehicleType: form.elements.vehicleType.value,
            wcShowerRequested: form.elements.wcShowerRequested.checked,
            remarks: form.elements.remarks.value.trim(),
          };
        }

        async function previewQuote() {
          quoteNotice.className = 'notice info';
          quoteNotice.textContent = t.calculating;
          try {
            const data = await fetchJson(apiUrl, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(buildPayload('quote')),
            });
            quoteNotice.className = 'notice success';
            if (data.deltaAmount > 0) {
              quoteNotice.textContent = t.addsAmount.replace('{amount}', formatMoney(data.deltaAmount, data.quote.currency));
            } else if (data.deltaAmount < 0) {
              quoteNotice.textContent = t.reducesAmount.replace('{amount}', formatMoney(Math.abs(data.deltaAmount), data.quote.currency));
            } else {
              quoteNotice.textContent = t.keepsAmount;
            }
            setMeta(quoteMeta, [
              [t.quoteNights, String(data.quote.nights)],
              [t.quoteBase, formatMoney(data.quote.baseAmount, data.quote.currency)],
              [t.quoteTouristTax, formatMoney(data.quote.touristTaxAmount, data.quote.currency)],
              [t.quoteOptions, formatMoney(data.quote.optionsAmount, data.quote.currency)],
              [t.quoteSupplements, formatMoney(data.quote.guestSurchargeAmount || 0, data.quote.currency)],
              [t.quoteLongStay, formatMoney(data.quote.longStayDiscountAmount || 0, data.quote.currency)],
              [t.quoteFee, formatMoney(data.quote.paymentFeeAmount, data.quote.currency)],
              [t.quoteUpdatedTotal, formatMoney(data.nextTotal, data.quote.currency)],
            ]);
          } catch (error) {
            quoteNotice.className = 'notice error';
            quoteNotice.textContent = error.message;
            quoteMeta.innerHTML = '';
          }
        }

        async function applyUpdate(event) {
          event.preventDefault();
          quoteNotice.className = 'notice info';
          quoteNotice.textContent = t.applying;
          try {
            const data = await fetchJson(apiUrl, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(buildPayload('update')),
            });
            if (data.payment && safeHttpUrl(data.payment.hostedCheckoutUrl || '')) {
              quoteNotice.className = 'notice warn';
              quoteNotice.innerHTML = escapeHtml(t.extraPayment) + ' <a href="' + escapeHtml(data.payment.hostedCheckoutUrl) + '">' + escapeHtml(t.openPaymentPage) + '</a>.';
            } else if (data.deltaAmount < 0 && data.refund?.fullyRefunded) {
              quoteNotice.className = 'notice success';
              quoteNotice.textContent = t.refundTriggered;
            } else if (data.deltaAmount < 0) {
              quoteNotice.className = 'notice warn';
              quoteNotice.textContent = t.refundFollowUp;
            } else {
              quoteNotice.className = 'notice success';
              quoteNotice.textContent = t.updated;
            }
            await loadReservation();
          } catch (error) {
            quoteNotice.className = 'notice error';
            quoteNotice.textContent = error.message;
          }
        }

        async function cancelReservation() {
          if (!window.confirm(t.confirmCancel)) {
            return;
          }
          notice.className = 'notice info';
          notice.textContent = t.cancelling;
          try {
            await fetchJson(apiUrl, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action: 'cancel' }),
            });
            notice.className = 'notice success';
            notice.textContent = t.cancelled;
            form.hidden = true;
            quoteMeta.innerHTML = '';
          } catch (error) {
            notice.className = 'notice error';
            notice.textContent = error.message;
          }
        }

        async function resumePayment() {
          notice.className = 'notice info';
          notice.textContent = t.preparingPayment;
          try {
            const data = await fetchJson(apiUrl, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action: 'resume_payment' }),
            });
            if (data.payment && data.payment.hostedCheckoutUrl) {
              window.location.assign(data.payment.hostedCheckoutUrl);
              return;
            }
            notice.className = 'notice error';
            notice.textContent = t.paymentUnavailable;
          } catch (error) {
            notice.className = 'notice error';
            notice.textContent = error.message;
          }
        }

        previewButton.addEventListener('click', previewQuote);
        payButton.addEventListener('click', resumePayment);
        cancelButton.addEventListener('click', cancelReservation);
        form.addEventListener('submit', applyUpdate);
        loadReservation();
      })();
    </script>
  `;

  return html(
    htmlDocument({
      title: `${t.pageTitle} ${escapeHtml(token)}`,
      body,
      lang: locale,
    }),
  );
}
