import { diffNights, isIsoDateString } from "./date.js";

const ALLOWED_VEHICLE_TYPES = new Set([
  "standard_car",
  "car_roof_tent",
  "van",
  "caravan",
  "motorhome_upto_6_5m",
  "motorhome_over_6_5m",
]);

export function validateBookingInput(input, { requireGuestInfo = false, unit = null } = {}) {
  const errors = [];

  if (!input.unitCode?.trim()) {
    errors.push({ field: "unitCode", message: "Unit code is required" });
  }

  if (!isIsoDateString(input.checkInDate)) {
    errors.push({ field: "checkInDate", message: "Expected ISO date YYYY-MM-DD" });
  }

  if (!isIsoDateString(input.checkOutDate)) {
    errors.push({ field: "checkOutDate", message: "Expected ISO date YYYY-MM-DD" });
  }

  if (isIsoDateString(input.checkInDate) && isIsoDateString(input.checkOutDate)) {
    const nights = diffNights(input.checkInDate, input.checkOutDate);
    if (nights <= 0) {
      errors.push({ field: "checkOutDate", message: "Check-out must be after check-in" });
    }
  }

  const requiresVehicleType = unit?.settings?.requiresVehicleType ?? (input.unitCode === "parking-space");

  if (requiresVehicleType && !ALLOWED_VEHICLE_TYPES.has(input.vehicleType)) {
    errors.push({ field: "vehicleType", message: "Unsupported vehicle type" });
  }

  const minStayNights = Number(unit?.settings?.minStayNights || 1);
  if (isIsoDateString(input.checkInDate) && isIsoDateString(input.checkOutDate)) {
    const nights = diffNights(input.checkInDate, input.checkOutDate);
    if (nights < minStayNights) {
      errors.push({
        field: "checkOutDate",
        message: `Minimum stay is ${minStayNights} night(s) for this unit`,
      });
    }
  }

  if (!Number.isInteger(input.adults) || input.adults < 1) {
    errors.push({ field: "adults", message: "At least one adult is required" });
  }

  if (!Number.isInteger(input.children) || input.children < 0) {
    errors.push({ field: "children", message: "Children must be zero or more" });
  }

  if (requireGuestInfo) {
    if (!input.guestFirstName?.trim()) {
      errors.push({ field: "guestFirstName", message: "First name is required" });
    }

    if (!input.guestLastName?.trim()) {
      errors.push({ field: "guestLastName", message: "Last name is required" });
    }

    if (!input.guestEmail?.trim() || !/.+@.+\..+/.test(input.guestEmail)) {
      errors.push({ field: "guestEmail", message: "Valid email is required" });
    }
  }

  return errors;
}

export function normalizeBookingInput(raw) {
  return {
    unitCode: typeof raw.unitCode === "string" ? raw.unitCode.trim() : "parking-space",
    locale: typeof raw.locale === "string" ? raw.locale : "fr",
    checkInDate: raw.checkInDate,
    checkOutDate: raw.checkOutDate,
    vehicleType: raw.vehicleType,
    vehicleLengthM:
      raw.vehicleLengthM === undefined || raw.vehicleLengthM === null || raw.vehicleLengthM === ""
        ? null
        : Number(raw.vehicleLengthM),
    adults: Number(raw.adults ?? 0),
    children: Number(raw.children ?? 0),
    wcShowerRequested: Boolean(raw.wcShowerRequested),
    nonRefundableSelected: Boolean(raw.nonRefundableSelected),
    remarks: typeof raw.remarks === "string" ? raw.remarks.trim() : "",
    guestFirstName: typeof raw.guestFirstName === "string" ? raw.guestFirstName.trim() : "",
    guestLastName: typeof raw.guestLastName === "string" ? raw.guestLastName.trim() : "",
    guestEmail: typeof raw.guestEmail === "string" ? raw.guestEmail.trim().toLowerCase() : "",
    guestPhone: typeof raw.guestPhone === "string" ? raw.guestPhone.trim() : "",
    acceptedTerms: Boolean(raw.acceptedTerms),
  };
}
