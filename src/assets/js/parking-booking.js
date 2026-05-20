(function () {
  const root = document.getElementById("parking-booking-app");

  if (!root) {
    return;
  }

  const apiBase = root.dataset.apiBase || "/api/booking";
  const locale = root.dataset.locale || "fr";
  const unitCode = root.dataset.unitCode || "parking-space";
  const form = document.getElementById("parking-booking-form");
  const submitButton = document.getElementById("booking-submit");
  const availabilityStatus = document.getElementById("booking-availability-status");
  const submitStatus = document.getElementById("booking-submit-status");
  const successCard = document.getElementById("booking-success-card");
  const successReference = document.getElementById("booking-success-reference");
  const successManageLink = document.getElementById("booking-success-manage-link");
  const successPaymentWrap = document.getElementById("booking-success-payment-link-wrap");
  const successPaymentLink = document.getElementById("booking-success-payment-link");
  const nonRefundableCheckbox = document.getElementById("booking-non-refundable");

  const texts = {
    enterDates: root.dataset.msgEnterDates || "",
    checking: root.dataset.msgChecking || "",
    available: root.dataset.msgAvailable || "",
    unavailable: root.dataset.msgUnavailable || "",
    quoteError: root.dataset.msgQuoteError || "",
    reservationError: root.dataset.msgReservationError || "",
    config: root.dataset.msgConfig || "",
    created: root.dataset.msgCreated || "",
    redirecting: root.dataset.msgRedirecting || "",
    terms: root.dataset.msgTerms || "",
  };

  const fields = {
    checkInDate: form.elements.checkInDate,
    checkOutDate: form.elements.checkOutDate,
    adults: form.elements.adults,
    children: form.elements.children,
    vehicleType: form.elements.vehicleType,
    wcShowerRequested: form.elements.wcShowerRequested,
    nonRefundableSelected: form.elements.nonRefundableSelected,
    guestFirstName: form.elements.guestFirstName,
    guestLastName: form.elements.guestLastName,
    guestEmail: form.elements.guestEmail,
    guestPhone: form.elements.guestPhone,
    remarks: form.elements.remarks,
    acceptedTerms: form.elements.acceptedTerms,
  };

  const summary = {
    stayLabel: document.getElementById("booking-stay-label"),
    baseAmount: document.getElementById("booking-base-amount"),
    taxAmount: document.getElementById("booking-tax-amount"),
    optionsAmount: document.getElementById("booking-options-amount"),
    longStayDiscount: document.getElementById("booking-long-stay-discount"),
    nonRefundableDiscount: document.getElementById("booking-non-refundable-discount"),
    paymentFee: document.getElementById("booking-payment-fee"),
    totalAmount: document.getElementById("booking-total-amount"),
  };

  let latestQuote = null;
  let availabilityController = null;
  let quoteController = null;

  initializeDateInputs();
  wireEvents();
  resetSummary();

  function initializeDateInputs() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const minCheckIn = toDateInputValue(today);
    const minCheckOut = toDateInputValue(tomorrow);

    fields.checkInDate.min = minCheckIn;
    fields.checkOutDate.min = minCheckOut;
  }

  function wireEvents() {
    [
      fields.checkInDate,
      fields.checkOutDate,
      fields.adults,
      fields.children,
      fields.vehicleType,
      fields.wcShowerRequested,
      fields.nonRefundableSelected,
    ].forEach((field) => {
      field.addEventListener("change", handleQuoteRefresh);
      field.addEventListener("input", handleQuoteRefresh);
    });

    fields.checkInDate.addEventListener("change", () => {
      if (fields.checkInDate.value) {
        const nextDay = new Date(fields.checkInDate.value);
        nextDay.setDate(nextDay.getDate() + 1);
        const minCheckOut = toDateInputValue(nextDay);
        fields.checkOutDate.min = minCheckOut;

        if (!fields.checkOutDate.value || fields.checkOutDate.value <= fields.checkInDate.value) {
          fields.checkOutDate.value = minCheckOut;
        }
      }
    });

    form.addEventListener("submit", handleSubmit);
  }

  async function handleQuoteRefresh() {
    successCard.classList.add("hidden");
    successPaymentWrap.classList.add("hidden");
    submitStatus.textContent = "";

    if (!hasCoreFields()) {
      latestQuote = null;
      setAvailabilityStatus(texts.enterDates, "neutral");
      resetSummary();
      return;
    }

    if (availabilityController) {
      availabilityController.abort();
    }
    if (quoteController) {
      quoteController.abort();
    }

    availabilityController = new AbortController();
    quoteController = new AbortController();

    setAvailabilityStatus(texts.checking, "loading");
    submitButton.disabled = true;

    const payload = buildPayload(false);

    try {
      const availability = await fetchJson(
        `${apiBase}/availability?from=${encodeURIComponent(payload.checkInDate)}&to=${encodeURIComponent(payload.checkOutDate)}&unitCode=${encodeURIComponent(unitCode)}`,
        {
          signal: availabilityController.signal,
        },
      );

      if (!availability.available) {
        latestQuote = null;
        setAvailabilityStatus(texts.unavailable, "error");
        resetSummary();
        return;
      }

      setAvailabilityStatus(texts.available, "success");

      const quoteResult = await fetchJson(`${apiBase}/quote`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: quoteController.signal,
      });

      latestQuote = quoteResult.quote;
      renderQuote(latestQuote, payload);
      submitButton.disabled = false;
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }

      latestQuote = null;
      setAvailabilityStatus(texts.quoteError, "error");
      resetSummary();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    submitStatus.textContent = "";
    successCard.classList.add("hidden");

    if (!fields.acceptedTerms.checked) {
      submitStatus.textContent = texts.terms;
      submitStatus.className = "booking-submit-status booking-submit-status-error";
      return;
    }

    if (!latestQuote) {
      await handleQuoteRefresh();
    }

    if (!latestQuote) {
      submitStatus.textContent = texts.reservationError;
      submitStatus.className = "booking-submit-status booking-submit-status-error";
      return;
    }

    submitButton.disabled = true;
    submitStatus.textContent = texts.created;
    submitStatus.className = "booking-submit-status booking-submit-status-loading";

    try {
      const reservationResult = await fetchJson(`${apiBase}/reservations`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(buildPayload(true)),
      });

      showSuccess(reservationResult);

      if (reservationResult.payment?.hostedCheckoutUrl) {
        submitStatus.textContent = texts.redirecting;
        submitStatus.className = "booking-submit-status booking-submit-status-loading";
        window.location.assign(reservationResult.payment.hostedCheckoutUrl);
        return;
      }

      submitStatus.textContent = texts.config;
      submitStatus.className = "booking-submit-status booking-submit-status-warning";
    } catch (error) {
      submitStatus.textContent = texts.reservationError;
      submitStatus.className = "booking-submit-status booking-submit-status-error";
    } finally {
      submitButton.disabled = false;
    }
  }

  function buildPayload(includeGuestDetails) {
    const payload = {
      unitCode,
      locale,
      checkInDate: fields.checkInDate.value,
      checkOutDate: fields.checkOutDate.value,
      adults: Number(fields.adults.value || 0),
      children: Number(fields.children.value || 0),
      vehicleType: fields.vehicleType.value,
      wcShowerRequested: fields.wcShowerRequested.checked,
      nonRefundableSelected: fields.nonRefundableSelected.checked,
    };

    if (includeGuestDetails) {
      payload.guestFirstName = fields.guestFirstName.value.trim();
      payload.guestLastName = fields.guestLastName.value.trim();
      payload.guestEmail = fields.guestEmail.value.trim();
      payload.guestPhone = fields.guestPhone.value.trim();
      payload.remarks = fields.remarks.value.trim();
      payload.acceptedTerms = fields.acceptedTerms.checked;
    }

    return payload;
  }

  function hasCoreFields() {
    return (
      fields.checkInDate.value &&
      fields.checkOutDate.value &&
      Number(fields.adults.value || 0) >= 1 &&
      fields.vehicleType.value
    );
  }

  function renderQuote(quote, payload) {
    summary.stayLabel.textContent = `${payload.checkInDate} → ${payload.checkOutDate} (${quote.nights})`;
    summary.baseAmount.textContent = formatCurrency(quote.baseAmount, quote.currency);
    summary.taxAmount.textContent = formatCurrency(quote.touristTaxAmount, quote.currency);
    summary.optionsAmount.textContent = formatCurrency(quote.optionsAmount, quote.currency);
    summary.longStayDiscount.textContent = formatSignedCurrency(-quote.longStayDiscountAmount, quote.currency);
    summary.nonRefundableDiscount.textContent = formatSignedCurrency(-quote.nonRefundableDiscountAmount, quote.currency);
    summary.paymentFee.textContent = formatCurrency(quote.paymentFeeAmount, quote.currency);
    summary.totalAmount.textContent = formatCurrency(quote.totalAmount, quote.currency);

    nonRefundableCheckbox.disabled = !quote.canSelectNonRefundableDiscount;
    if (!quote.canSelectNonRefundableDiscount) {
      nonRefundableCheckbox.checked = false;
    }
  }

  function resetSummary() {
    summary.stayLabel.textContent = "-";
    summary.baseAmount.textContent = "-";
    summary.taxAmount.textContent = "-";
    summary.optionsAmount.textContent = "-";
    summary.longStayDiscount.textContent = "-";
    summary.nonRefundableDiscount.textContent = "-";
    summary.paymentFee.textContent = "-";
    summary.totalAmount.textContent = "-";
    submitButton.disabled = true;
  }

  function setAvailabilityStatus(message, tone) {
    availabilityStatus.textContent = message;
    availabilityStatus.className = `booking-status booking-status-${tone}`;
  }

  function showSuccess(reservationResult) {
    successCard.classList.remove("hidden");
    successReference.textContent = reservationResult.reservation.publicReference;
    successManageLink.href = reservationResult.reservation.manageUrl;

    if (reservationResult.payment?.hostedCheckoutUrl) {
      successPaymentWrap.classList.remove("hidden");
      successPaymentLink.href = reservationResult.payment.hostedCheckoutUrl;
    } else {
      successPaymentWrap.classList.add("hidden");
    }
  }

  async function fetchJson(url, init) {
    const response = await fetch(url, init);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const message = data?.message || `Request failed with status ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  function formatCurrency(value, currency) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency || "CHF",
      minimumFractionDigits: 2,
    }).format(value || 0);
  }

  function formatSignedCurrency(value, currency) {
    if (!value) {
      return formatCurrency(0, currency);
    }

    return `${value < 0 ? "-" : "+"}${formatCurrency(Math.abs(value), currency)}`;
  }

  function toDateInputValue(date) {
    return date.toISOString().slice(0, 10);
  }
})();
