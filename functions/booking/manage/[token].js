import { html } from "../../_lib/http.js";
import { htmlDocument, escapeHtml } from "../../_lib/ui.js";

export function onRequestGet(context) {
  const token = context.params.token;
  const body = `
    <section class="hero">
      <h1>Manage your reservation</h1>
      <p>Update your dates, adjust the optional WC-shower access, or cancel an eligible booking without going through WhatsApp first.</p>
    </section>
    <div class="grid cols-2">
      <section class="card stack">
        <h2>Your booking</h2>
        <div id="manage-notice" class="notice info">Loading your reservation…</div>
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
              <label for="checkInDate">Arrival date</label>
              <input id="checkInDate" name="checkInDate" type="date" required toolparamdescription="Updated arrival date in YYYY-MM-DD format.">
            </div>
            <div class="field">
              <label for="checkOutDate">Departure date</label>
              <input id="checkOutDate" name="checkOutDate" type="date" required toolparamdescription="Updated departure date in YYYY-MM-DD format.">
            </div>
          </div>
          <div class="field-row four">
            <div class="field">
              <label for="adults">Adults</label>
              <input id="adults" name="adults" type="number" min="1" required toolparamdescription="Updated number of adult travellers.">
            </div>
            <div class="field">
              <label for="children">Children</label>
              <input id="children" name="children" type="number" min="0" required toolparamdescription="Updated number of children under 16 years old.">
            </div>
            <div class="field" id="infants-wrap">
              <label for="infants">Infants (0-2)</label>
              <input id="infants" name="infants" type="number" min="0" required toolparamdescription="Updated number of infants aged 0 to 2.">
            </div>
            <div class="field" id="vehicle-wrap">
              <label for="vehicleType">Vehicle</label>
              <select id="vehicleType" name="vehicleType" toolparamdescription="Updated vehicle category for parking reservations.">
                <option value="standard_car">Standard car</option>
                <option value="car_roof_tent">Car with roof tent</option>
                <option value="van">Van</option>
                <option value="caravan">Caravan</option>
                <option value="motorhome_upto_6_5m">Motorhome up to 6.5 m</option>
                <option value="motorhome_over_6_5m">Motorhome over 6.5 m</option>
              </select>
            </div>
          </div>
          <label class="checkbox">
            <input id="wcShowerRequested" name="wcShowerRequested" type="checkbox" toolparamdescription="Set to true to add or keep indoor WC-shower access for the reservation.">
            <span>Add or keep indoor WC-shower access (CHF 10 per stay)</span>
          </label>
          <div class="field">
            <label for="remarks">Remarks</label>
            <textarea id="remarks" name="remarks" toolparamdescription="Updated remarks for the reservation."></textarea>
          </div>
          <div class="actions">
            <button class="btn-primary" type="button" id="pay-button" hidden>Pay now to confirm</button>
            <button class="btn-secondary" type="button" id="preview-button">Preview updated total</button>
            <button class="btn-primary" type="submit" id="update-button">Save changes</button>
            <button class="btn-danger" type="button" id="cancel-button">Cancel reservation</button>
          </div>
        </form>
      </section>
      <aside class="card stack">
        <h2>Updated pricing</h2>
        <div id="quote-notice" class="notice info">Select new dates or options, then preview the updated total.</div>
        <div id="quote-meta" class="meta"></div>
      </aside>
    </div>
    <script>
      (() => {
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
            throw new Error(data.message || 'Request failed');
          }
          return data;
        }

        function setMeta(target, rows) {
          target.innerHTML = rows.map(([label, value]) => '<div class="meta-row"><span class="label">' + label + '</span><span class="value">' + value + '</span></div>').join('');
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
          return new Intl.NumberFormat('en-CH', { style: 'currency', currency }).format(Number(value || 0));
        }

        async function loadReservation() {
          try {
            const data = await fetchJson(apiUrl);
            reservation = data.reservation;
            notice.className = 'notice info';
            notice.innerHTML = data.notices.length
              ? data.notices.map((item) => '<div>' + item + '</div>').join('')
              : 'Your booking is ready to be managed below.';
            setMeta(meta, [
              ['Reference', reservation.publicReference],
              ['Unit', reservation.unitDisplayName],
              ['Status', reservation.status],
              ['Payment', reservation.paymentStatus || '-'],
              ['Guest', reservation.guestFirstName + ' ' + reservation.guestLastName],
              ['Current total', formatMoney(reservation.totalAmount, reservation.currency)],
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
            action,
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
          quoteNotice.textContent = 'Calculating your updated total…';
          try {
            const data = await fetchJson(apiUrl, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(buildPayload('quote')),
            });
            quoteNotice.className = 'notice success';
            if (data.deltaAmount > 0) {
              quoteNotice.textContent = 'This change adds ' + formatMoney(data.deltaAmount, data.quote.currency) + '.';
            } else if (data.deltaAmount < 0) {
              quoteNotice.textContent = 'This change reduces the total by ' + formatMoney(Math.abs(data.deltaAmount), data.quote.currency) + '.';
            } else {
              quoteNotice.textContent = 'This change keeps the same total amount.';
            }
            setMeta(quoteMeta, [
              ['Nights', String(data.quote.nights)],
              ['Base', formatMoney(data.quote.baseAmount, data.quote.currency)],
              ['Tourist tax', formatMoney(data.quote.touristTaxAmount, data.quote.currency)],
              ['Options', formatMoney(data.quote.optionsAmount, data.quote.currency)],
              ['Guest supplements', formatMoney(data.quote.guestSurchargeAmount || 0, data.quote.currency)],
              ['Long-stay discount', formatMoney(data.quote.longStayDiscountAmount || 0, data.quote.currency)],
              ['Payment fee', formatMoney(data.quote.paymentFeeAmount, data.quote.currency)],
              ['Updated total', formatMoney(data.nextTotal, data.quote.currency)],
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
          quoteNotice.textContent = 'Applying your changes…';
          try {
            const data = await fetchJson(apiUrl, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(buildPayload('update')),
            });
            if (data.payment && data.payment.hostedCheckoutUrl) {
              quoteNotice.className = 'notice warn';
              quoteNotice.innerHTML = 'Your changes need an extra payment. <a href="' + data.payment.hostedCheckoutUrl + '">Open the payment page</a>.';
            } else if (data.deltaAmount < 0 && data.refund?.fullyRefunded) {
              quoteNotice.className = 'notice success';
              quoteNotice.textContent = 'Your changes were saved and the refund was triggered automatically.';
            } else if (data.deltaAmount < 0) {
              quoteNotice.className = 'notice warn';
              quoteNotice.textContent = 'Your changes were saved. A refund still needs follow-up.';
            } else {
              quoteNotice.className = 'notice success';
              quoteNotice.textContent = 'Your reservation has been updated.';
            }
            await loadReservation();
          } catch (error) {
            quoteNotice.className = 'notice error';
            quoteNotice.textContent = error.message;
          }
        }

        async function cancelReservation() {
          if (!window.confirm('Cancel this reservation now?')) {
            return;
          }
          notice.className = 'notice info';
          notice.textContent = 'Cancelling reservation…';
          try {
            await fetchJson(apiUrl, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action: 'cancel' }),
            });
            notice.className = 'notice success';
            notice.textContent = 'Your reservation has been cancelled.';
            form.hidden = true;
            quoteMeta.innerHTML = '';
          } catch (error) {
            notice.className = 'notice error';
            notice.textContent = error.message;
          }
        }

        async function resumePayment() {
          notice.className = 'notice info';
          notice.textContent = 'Preparing your payment link…';
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
            notice.textContent = 'Payment is not available right now. Please contact us if needed.';
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
      title: `Manage reservation ${escapeHtml(token)}`,
      body,
      lang: "en",
    }),
  );
}
