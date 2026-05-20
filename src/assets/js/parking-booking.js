(function () {
  const root = document.getElementById("parking-booking-app");

  if (!root) {
    return;
  }

  const apiBase = root.dataset.apiBase || "/api/booking";
  const locale = root.dataset.locale || "fr";
  const unitCode = root.dataset.unitCode || "parking-space";
  const requiresVehicle = root.dataset.requiresVehicle === "true";
  const availabilityToolName = root.dataset.toolAvailabilityName || "check_parking_availability";
  const availabilityToolDescription =
    root.dataset.toolAvailabilityDescription || "Check whether the selected stay is available.";
  const quoteToolName = root.dataset.toolQuoteName || "quote_parking_stay";
  const quoteToolDescription =
    root.dataset.toolQuoteDescription || "Calculate a direct-booking quote for the selected stay.";
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
  const calendarShell = document.querySelector(".booking-calendar-shell");
  const calendarGrid = document.getElementById("booking-calendar-grid");
  const calendarSync = document.getElementById("booking-calendar-sync");
  const calendarPrevButton = document.getElementById("booking-calendar-prev");
  const calendarNextButton = document.getElementById("booking-calendar-next");
  const calendarHelpText =
    document.querySelector(".booking-calendar-help")?.textContent?.trim() || "";

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
    summaryEmptyStay: root.dataset.msgSummaryEmptyStay || "",
    summaryPendingAmount: root.dataset.msgSummaryPendingAmount || "",
    nightSingular: root.dataset.msgNightSingular || "night",
    nightPlural: root.dataset.msgNightPlural || "nights",
    calendarPrev: root.dataset.msgCalendarPrev || "Previous month",
    calendarNext: root.dataset.msgCalendarNext || "Next month",
    calendarLastSyncPrefix: root.dataset.msgCalendarLastSyncPrefix || "Last Booking sync",
    calendarArrival: root.dataset.msgCalendarArrival || "Check-in",
    calendarDeparture: root.dataset.msgCalendarDeparture || "Check-out",
    calendarBlockedShort: root.dataset.msgCalendarBlockedShort || "Unavailable",
  };

  const fields = {
    checkInDate: form.elements.checkInDate,
    checkOutDate: form.elements.checkOutDate,
    adults: form.elements.adults,
    children: form.elements.children,
    infants: form.elements.infants,
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
    guestSurcharge: document.getElementById("booking-guest-surcharge"),
    optionsAmount: document.getElementById("booking-options-amount"),
    longStayDiscount: document.getElementById("booking-long-stay-discount"),
    nonRefundableDiscount: document.getElementById("booking-non-refundable-discount"),
    weeklyDiscount: document.getElementById("booking-weekly-discount"),
    paymentFee: document.getElementById("booking-payment-fee"),
    totalAmount: document.getElementById("booking-total-amount"),
  };

  let latestQuote = null;
  let availabilityController = null;
  let quoteController = null;
  let calendarController = null;
  let currentMonthCursor = startOfMonth(new Date());
  let blockedDates = new Set();
  let nightlyRateByDate = new Map();
  let minimumStayNights = 1;
  let calendarDataState = "loading";
  const webMcpController = supportsWebMcp() ? new AbortController() : null;

  initializeDateInputs();
  wireEvents();
  resetSummary();
  renderCalendars();
  loadCalendarAvailability();
  registerWebMcpTools();

  function initializeDateInputs() {
    const today = new Date();
    const minCheckIn = toDateInputValue(today);
    const minCheckOut = getDefaultCheckOutMin();

    fields.checkInDate.min = minCheckIn;
    fields.checkOutDate.min = minCheckOut;
  }

  function wireEvents() {
    [
      fields.checkInDate,
      fields.checkOutDate,
      fields.adults,
      fields.children,
      fields.infants,
      fields.vehicleType,
      fields.wcShowerRequested,
      fields.nonRefundableSelected,
    ].filter(Boolean).forEach((field) => {
      field.addEventListener("change", handleQuoteRefresh);
      field.addEventListener("input", handleQuoteRefresh);
    });

    fields.checkInDate.addEventListener("change", () => {
      if (fields.checkInDate.value) {
        const nextDay = new Date(fields.checkInDate.value);
        nextDay.setDate(nextDay.getDate() + 1);
        const minCheckOut = toDateInputValue(nextDay);
        fields.checkOutDate.min = minCheckOut;

        if (fields.checkOutDate.value && fields.checkOutDate.value <= fields.checkInDate.value) {
          fields.checkOutDate.value = "";
        }
      } else {
        fields.checkOutDate.value = "";
        fields.checkOutDate.min = getDefaultCheckOutMin();
      }

      renderCalendars();
    });

    fields.checkOutDate.addEventListener("change", renderCalendars);

    if (calendarPrevButton && calendarNextButton) {
      calendarPrevButton.addEventListener("click", () => {
        currentMonthCursor = addMonths(currentMonthCursor, -1);
        renderCalendars();
        loadCalendarAvailability();
      });

      calendarNextButton.addEventListener("click", () => {
        currentMonthCursor = addMonths(currentMonthCursor, 1);
        renderCalendars();
        loadCalendarAvailability();
      });
    }

    form.addEventListener("submit", handleSubmit);

    if (webMcpController) {
      window.addEventListener(
        "pagehide",
        () => {
          webMcpController.abort();
        },
        { once: true },
      );
    }
  }

  async function loadCalendarAvailability() {
    if (!calendarGrid) {
      return;
    }

    if (calendarController) {
      calendarController.abort();
    }

    calendarController = new AbortController();
    const windowStart = formatDateKey(startOfMonth(currentMonthCursor));
    const windowEnd = formatDateKey(endOfMonth(addMonths(currentMonthCursor, 1)));
    calendarDataState = "loading";
    syncCalendarVisualState();
    renderCalendars();

    try {
      const availability = await fetchJson(
        `${apiBase}/availability?from=${encodeURIComponent(windowStart)}&to=${encodeURIComponent(windowEnd)}&unitCode=${encodeURIComponent(unitCode)}`,
        {
          signal: calendarController.signal,
        },
      );

      blockedDates = expandBlockedDates(availability.blockedRanges || []);
      nightlyRateByDate = new Map(
        (availability.nightlyRates || []).map((night) => [night.date, Number(night.rate)]),
      );
      minimumStayNights = Number(availability.unit?.minStayNights || 1);
      calendarDataState = "ready";
      syncCalendarVisualState();
      renderCalendarSync(availability.lastCalendarSyncAt);
      renderCalendars();
      if (!hasCoreFields()) {
        setAvailabilityGuidance();
      }
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }

      blockedDates = new Set();
      nightlyRateByDate = new Map();
      calendarDataState = "error";
      syncCalendarVisualState();
      renderCalendarSync(null);
      renderCalendars();
      if (!hasCoreFields()) {
        setAvailabilityGuidance();
      }
    }
  }

  async function handleQuoteRefresh() {
    successCard.classList.add("hidden");
    successPaymentWrap.classList.add("hidden");
    submitStatus.textContent = "";

    if (!hasStayDates()) {
      latestQuote = null;
      setAvailabilityGuidance();
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

      if (!canBuildQuote()) {
        latestQuote = null;
        resetSummary();
        return;
      }

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
      infants: Number(fields.infants?.value || 0),
      vehicleType: fields.vehicleType?.value || "",
      wcShowerRequested: Boolean(fields.wcShowerRequested?.checked),
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

  function renderCalendars() {
    if (!calendarGrid) {
      return;
    }

    calendarGrid.innerHTML = "";

    for (let monthOffset = 0; monthOffset < 2; monthOffset += 1) {
      const monthDate = addMonths(currentMonthCursor, monthOffset);
      calendarGrid.appendChild(buildMonthElement(monthDate));
    }
  }

  function buildMonthElement(monthDate) {
    const month = document.createElement("section");
    month.className = "booking-month";

    const title = document.createElement("h4");
    title.className = "booking-month-title";
    title.textContent = new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
    }).format(monthDate);
    month.appendChild(title);

    const weekdays = document.createElement("div");
    weekdays.className = "booking-weekdays";
    getWeekdayLabels().forEach((label) => {
      const cell = document.createElement("span");
      cell.textContent = label;
      weekdays.appendChild(cell);
    });
    month.appendChild(weekdays);

    const days = document.createElement("div");
    days.className = "booking-days";

    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const leadingOffset = (firstDay.getDay() + 6) % 7;
    for (let index = 0; index < leadingOffset; index += 1) {
      const spacer = document.createElement("div");
      spacer.className = "booking-day-spacer";
      days.appendChild(spacer);
    }

    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const cellDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
      days.appendChild(buildDayButton(cellDate));
    }

    month.appendChild(days);
    return month;
  }

  function buildDayButton(date) {
    const button = document.createElement("button");
    const dateKey = formatDateKey(date);
    const isPast = dateKey < fields.checkInDate.min;
    const isCalendarUnavailable = calendarDataState !== "ready";
    const isBlocked = blockedDates.has(dateKey);
    const isMinStayBlocked = !isPast && !isBlocked && !canStartStayOn(dateKey);
    const isSelectedStart = dateKey === fields.checkInDate.value;
    const isSelectedEnd = dateKey === fields.checkOutDate.value;
    const inSelectedRange = isDateInsideSelectedRange(dateKey);

    button.type = "button";
    button.className = "booking-day";

    if (isPast || isBlocked || isMinStayBlocked || isCalendarUnavailable) {
      button.classList.add("booking-day-disabled");
      button.disabled = true;
    }

    if (isPast) {
      button.classList.add("booking-day-past");
    } else if (isBlocked) {
      button.classList.add("booking-day-blocked");
    } else if (isMinStayBlocked) {
      button.classList.add("booking-day-blocked");
    } else if (isCalendarUnavailable) {
      button.classList.add("booking-day-unavailable-data");
    } else if (inSelectedRange) {
      button.classList.add("booking-day-in-range");
    }

    if (isSelectedStart || isSelectedEnd) {
      button.classList.add("booking-day-selected");
    }

    button.setAttribute("aria-label", new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date));

    if (!(isPast || isBlocked || isMinStayBlocked || isCalendarUnavailable)) {
      button.addEventListener("click", () => handleCalendarSelection(dateKey));
    }

    const dayNumber = document.createElement("span");
    dayNumber.className = "booking-day-number";
    dayNumber.textContent = String(date.getDate());
    button.appendChild(dayNumber);

    const state = document.createElement("span");
    state.className = "booking-day-state";
    if (isSelectedStart) {
      state.textContent = texts.calendarArrival;
    } else if (isSelectedEnd) {
      state.textContent = texts.calendarDeparture;
    } else if (isCalendarUnavailable) {
      state.textContent = "";
    } else if (isBlocked || isMinStayBlocked) {
      state.textContent = texts.calendarBlockedShort;
    } else if (nightlyRateByDate.has(dateKey)) {
      state.textContent = formatDayPrice(nightlyRateByDate.get(dateKey));
    } else {
      state.textContent = "";
    }
    button.appendChild(state);

    return button;
  }

  function handleCalendarSelection(dateKey) {
    const hasStart = Boolean(fields.checkInDate.value);
    const hasEnd = Boolean(fields.checkOutDate.value);

    if (!hasStart) {
      fields.checkInDate.value = dateKey;
      fields.checkOutDate.value = "";
    } else if (!hasEnd) {
      if (dateKey === fields.checkInDate.value) {
        fields.checkInDate.value = "";
        fields.checkOutDate.value = "";
      } else if (dateKey < fields.checkInDate.value || rangeContainsBlockedDate(fields.checkInDate.value, dateKey)) {
        fields.checkInDate.value = dateKey;
        fields.checkOutDate.value = "";
      } else {
        fields.checkOutDate.value = dateKey;
      }
    } else {
      fields.checkInDate.value = dateKey;
      fields.checkOutDate.value = "";
    }

    fields.checkOutDate.min = fields.checkInDate.value
      ? nextAvailableDate(fields.checkInDate.value)
      : getDefaultCheckOutMin();
    renderCalendars();
    setAvailabilityGuidance();
    handleQuoteRefresh();
  }

  function nextAvailableDate(startDateKey) {
    const cursor = new Date(`${startDateKey}T00:00:00`);
    cursor.setDate(cursor.getDate() + 1);

    while (blockedDates.has(formatDateKey(cursor))) {
      cursor.setDate(cursor.getDate() + 1);
    }

    return formatDateKey(cursor);
  }

  function isDateInsideSelectedRange(dateKey) {
    return Boolean(
      fields.checkInDate.value &&
      fields.checkOutDate.value &&
      dateKey > fields.checkInDate.value &&
      dateKey < fields.checkOutDate.value
    );
  }

  function rangeContainsBlockedDate(startKey, endKey) {
    const cursor = new Date(`${startKey}T00:00:00`);
    cursor.setDate(cursor.getDate() + 1);

    while (formatDateKey(cursor) < endKey) {
      if (blockedDates.has(formatDateKey(cursor))) {
        return true;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return false;
  }

  function canStartStayOn(startKey) {
    const cursor = new Date(`${startKey}T00:00:00`);

    for (let nightIndex = 0; nightIndex < minimumStayNights; nightIndex += 1) {
      const key = formatDateKey(cursor);
      if (blockedDates.has(key)) {
        return false;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return true;
  }

  function expandBlockedDates(ranges) {
    const set = new Set();

    ranges.forEach((range) => {
      const cursor = new Date(`${range.startDate}T00:00:00`);
      const end = new Date(`${range.endDate}T00:00:00`);

      while (cursor < end) {
        set.add(formatDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    return set;
  }

  function hasCoreFields() {
    return canBuildQuote();
  }

  function supportsWebMcp() {
    return Boolean(
      typeof navigator !== "undefined" &&
      navigator.modelContext &&
      typeof navigator.modelContext.registerTool === "function"
    );
  }

  function registerWebMcpTools() {
    if (!webMcpController) {
      return;
    }

    navigator.modelContext.registerTool(
      {
        name: availabilityToolName,
        description: availabilityToolDescription,
        inputSchema: {
          type: "object",
          properties: {
            checkInDate: {
              type: "string",
              description: "Arrival date in YYYY-MM-DD format.",
              pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            },
            checkOutDate: {
              type: "string",
              description: "Departure date in YYYY-MM-DD format.",
              pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            },
          },
          required: ["checkInDate", "checkOutDate"],
        },
        annotations: {
          readOnlyHint: true,
        },
        execute: async ({ checkInDate, checkOutDate }) => {
          applyToolStayInputs(checkInDate, checkOutDate);
          const availability = await fetchAvailabilityForRange(checkInDate, checkOutDate);

          if (!availability.available) {
            latestQuote = null;
            setAvailabilityStatus(texts.unavailable, "error");
            resetSummary();
          } else {
            setAvailabilityStatus(texts.available, "success");
          }

          renderCalendarSync(availability.lastCalendarSyncAt || null);

          return {
            unitCode,
            available: availability.available,
            minStayNights: availability.unit?.minStayNights || minimumStayNights,
            blockedRanges: availability.blockedRanges || [],
            nightlyRates: availability.nightlyRates || [],
            lastCalendarSyncAt: availability.lastCalendarSyncAt || null,
          };
        },
      },
      { signal: webMcpController.signal },
    );

    navigator.modelContext.registerTool(
      {
        name: quoteToolName,
        description: quoteToolDescription,
        inputSchema: {
          type: "object",
          properties: {
            checkInDate: {
              type: "string",
              description: "Arrival date in YYYY-MM-DD format.",
              pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            },
            checkOutDate: {
              type: "string",
              description: "Departure date in YYYY-MM-DD format.",
              pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            },
            adults: {
              type: "number",
              description: "Number of adult travellers.",
            },
            children: {
              type: "number",
              description: "Number of children under 16.",
            },
            infants: {
              type: "number",
              description: "Number of infants aged 0 to 2.",
            },
            vehicleType: {
              type: "string",
              description: "Vehicle category for the stay.",
              enum: [
                "standard_car",
                "car_roof_tent",
                "van",
                "caravan",
                "motorhome_upto_6_5m",
                "motorhome_over_6_5m",
              ],
            },
            wcShowerRequested: {
              type: "boolean",
              description: "Set to true to include indoor WC-shower access.",
            },
            nonRefundableSelected: {
              type: "boolean",
              description:
                "Set to true only if the traveller explicitly chooses the discounted non-refundable rate when eligible.",
            },
          },
          required: requiresVehicle
            ? ["checkInDate", "checkOutDate", "adults", "vehicleType"]
            : ["checkInDate", "checkOutDate", "adults"],
        },
        annotations: {
          readOnlyHint: true,
        },
        execute: async (input) => {
          applyToolQuoteInputs(input);
          return fetchQuoteForCurrentForm();
        },
      },
      { signal: webMcpController.signal },
    );
  }

  function applyToolStayInputs(checkInDate, checkOutDate) {
    fields.checkInDate.value = checkInDate || "";
    fields.checkOutDate.value = checkOutDate || "";

    if (fields.checkInDate.value) {
      const nextDay = new Date(`${fields.checkInDate.value}T00:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      fields.checkOutDate.min = toDateInputValue(nextDay);
      currentMonthCursor = startOfMonth(new Date(`${fields.checkInDate.value}T00:00:00`));
    } else {
      fields.checkOutDate.min = getDefaultCheckOutMin();
    }

    renderCalendars();
    loadCalendarAvailability();
  }

  function applyToolQuoteInputs(input) {
    applyToolStayInputs(input.checkInDate, input.checkOutDate);
    fields.adults.value = String(input.adults ?? 1);
    fields.children.value = String(input.children ?? 0);
    if (fields.infants) {
      fields.infants.value = String(input.infants ?? 0);
    }
    if (fields.vehicleType) {
      fields.vehicleType.value = input.vehicleType || "";
    }
    if (fields.wcShowerRequested) {
      fields.wcShowerRequested.checked = Boolean(input.wcShowerRequested);
    }
    fields.nonRefundableSelected.checked = Boolean(input.nonRefundableSelected);
  }

  async function fetchAvailabilityForRange(checkInDate, checkOutDate) {
    return fetchJson(
      `${apiBase}/availability?from=${encodeURIComponent(checkInDate)}&to=${encodeURIComponent(checkOutDate)}&unitCode=${encodeURIComponent(unitCode)}`,
    );
  }

  async function fetchQuoteForCurrentForm() {
    const payload = buildPayload(false);
    const availability = await fetchAvailabilityForRange(payload.checkInDate, payload.checkOutDate);

    if (!availability.available) {
      latestQuote = null;
      setAvailabilityStatus(texts.unavailable, "error");
      resetSummary();

      return {
        unitCode,
        available: false,
        blockedRanges: availability.blockedRanges || [],
        lastCalendarSyncAt: availability.lastCalendarSyncAt || null,
      };
    }

    setAvailabilityStatus(texts.available, "success");
    renderCalendarSync(availability.lastCalendarSyncAt || null);

    const quoteResult = await fetchJson(`${apiBase}/quote`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    latestQuote = quoteResult.quote;
    renderQuote(latestQuote, payload);
    submitButton.disabled = false;

    return {
      unitCode,
      available: true,
      quote: quoteResult.quote,
      bookingInput: quoteResult.bookingInput,
      lastCalendarSyncAt: availability.lastCalendarSyncAt || null,
    };
  }

  function hasStayDates() {
    return Boolean(fields.checkInDate.value && fields.checkOutDate.value);
  }

  function canBuildQuote() {
    return (
      hasStayDates() &&
      Number(fields.adults.value || 0) >= 1 &&
      (!requiresVehicle || Boolean(fields.vehicleType?.value))
    );
  }

  function renderQuote(quote, payload) {
    const nightLabel = quote.nights > 1 ? texts.nightPlural : texts.nightSingular;
    summary.stayLabel.textContent = `${formatDate(payload.checkInDate)} → ${formatDate(payload.checkOutDate)} · ${quote.nights} ${nightLabel}`;
    summary.baseAmount.textContent = formatCurrency(quote.baseAmount, quote.currency);
    summary.taxAmount.textContent = formatCurrency(quote.touristTaxAmount, quote.currency);
    if (summary.guestSurcharge) {
      summary.guestSurcharge.textContent = formatCurrency(quote.guestSurchargeAmount || 0, quote.currency);
    }
    if (summary.optionsAmount) {
      summary.optionsAmount.textContent = formatCurrency(quote.optionsAmount, quote.currency);
    }
    summary.longStayDiscount.textContent = formatSignedCurrency(-quote.longStayDiscountAmount, quote.currency);
    summary.nonRefundableDiscount.textContent = formatSignedCurrency(-quote.nonRefundableDiscountAmount, quote.currency);
    if (summary.weeklyDiscount) {
      summary.weeklyDiscount.textContent = formatSignedCurrency(-(quote.weeklyStayDiscountAmount || 0), quote.currency);
    }
    summary.paymentFee.textContent = formatCurrency(quote.paymentFeeAmount, quote.currency);
    summary.totalAmount.textContent = formatCurrency(quote.totalAmount, quote.currency);

    nonRefundableCheckbox.disabled = !quote.canSelectNonRefundableDiscount;
    if (!quote.canSelectNonRefundableDiscount) {
      nonRefundableCheckbox.checked = false;
    }
  }

  function resetSummary() {
    summary.stayLabel.textContent = texts.summaryEmptyStay;
    summary.baseAmount.textContent = texts.summaryPendingAmount;
    summary.taxAmount.textContent = texts.summaryPendingAmount;
    if (summary.guestSurcharge) {
      summary.guestSurcharge.textContent = texts.summaryPendingAmount;
    }
    if (summary.optionsAmount) {
      summary.optionsAmount.textContent = texts.summaryPendingAmount;
    }
    summary.longStayDiscount.textContent = texts.summaryPendingAmount;
    summary.nonRefundableDiscount.textContent = texts.summaryPendingAmount;
    if (summary.weeklyDiscount) {
      summary.weeklyDiscount.textContent = texts.summaryPendingAmount;
    }
    summary.paymentFee.textContent = texts.summaryPendingAmount;
    summary.totalAmount.textContent = texts.summaryPendingAmount;
    submitButton.disabled = true;
  }

  function setAvailabilityGuidance() {
    if (calendarDataState === "error") {
      setAvailabilityStatus(texts.quoteError, "error");
      return;
    }

    if (fields.checkInDate.value && !fields.checkOutDate.value) {
      setAvailabilityStatus(calendarHelpText || texts.enterDates, "neutral");
      return;
    }

    setAvailabilityStatus(texts.enterDates, "neutral");
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

  function formatDayPrice(value) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
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

  function getDefaultCheckOutMin() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return toDateInputValue(tomorrow);
  }

  function formatDateKey(date) {
    if (typeof date === "string") {
      return date;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function endOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  function addMonths(date, amount) {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1);
  }

  function getWeekdayLabels() {
    const labels = [];
    const baseMonday = new Date(Date.UTC(2026, 0, 5));

    for (let index = 0; index < 7; index += 1) {
      const date = new Date(baseMonday);
      date.setUTCDate(baseMonday.getUTCDate() + index);
      labels.push(
        new Intl.DateTimeFormat(locale, { weekday: "short" })
          .format(date)
          .replace(".", ""),
      );
    }

    return labels;
  }

  function renderCalendarSync(isoDateTime) {
    if (!calendarSync) {
      return;
    }

    if (!isoDateTime) {
      calendarSync.textContent = "";
      return;
    }

    const formatted = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(isoDateTime));

    calendarSync.textContent = `${texts.calendarLastSyncPrefix}: ${formatted}`;
  }

  function syncCalendarVisualState() {
    if (!calendarShell) {
      return;
    }

    calendarShell.dataset.state = calendarDataState;
  }

  function formatDate(isoDate) {
    if (!isoDate) {
      return "";
    }

    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(`${isoDate}T00:00:00`));
  }
})();
