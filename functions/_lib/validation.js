import { diffNights, isIsoDateString } from "./date.js";

const ALLOWED_VEHICLE_TYPES = new Set([
  "standard_car",
  "car_roof_tent",
  "van",
  "caravan",
  "motorhome_upto_6_5m",
  "motorhome_over_6_5m",
]);

const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 40;
const MAX_REMARKS_LENGTH = 2000;
const MAX_GUEST_COUNT = 20;
const MAX_VEHICLE_LENGTH_M = 20;

function isPositiveFiniteNumber(value) {
  return Number.isFinite(value) && value > 0;
}

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

  if (requiresVehicleType) {
    const hasVehicleType = typeof input.vehicleType === "string" && input.vehicleType.trim() !== "";
    if (requireGuestInfo || hasVehicleType) {
      if (!ALLOWED_VEHICLE_TYPES.has(input.vehicleType)) {
        errors.push({ field: "vehicleType", message: "Unsupported vehicle type" });
      }
    }
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
  } else if (input.adults > MAX_GUEST_COUNT) {
    errors.push({ field: "adults", message: "Adults exceeds supported limit" });
  }

  if (!Number.isInteger(input.children) || input.children < 0) {
    errors.push({ field: "children", message: "Children must be zero or more" });
  } else if (input.children > MAX_GUEST_COUNT) {
    errors.push({ field: "children", message: "Children exceeds supported limit" });
  }

  if (!Number.isInteger(input.infants) || input.infants < 0) {
    errors.push({ field: "infants", message: "Infants must be zero or more" });
  } else if (input.infants > MAX_GUEST_COUNT) {
    errors.push({ field: "infants", message: "Infants exceeds supported limit" });
  }

  if (input.vehicleLengthM !== null && input.vehicleLengthM !== undefined) {
    if (!isPositiveFiniteNumber(input.vehicleLengthM)) {
      errors.push({ field: "vehicleLengthM", message: "Vehicle length must be a positive number" });
    } else if (input.vehicleLengthM > MAX_VEHICLE_LENGTH_M) {
      errors.push({ field: "vehicleLengthM", message: "Vehicle length exceeds supported limit" });
    }
  }

  if (input.remarks && input.remarks.length > MAX_REMARKS_LENGTH) {
    errors.push({ field: "remarks", message: "Remarks is too long" });
  }

  const maxGuests = Number(unit?.settings?.maxGuests || 0);
  if (maxGuests > 0) {
    const totalGuests = Number(input.adults || 0) + Number(input.children || 0) + Number(input.infants || 0);
    if (totalGuests > maxGuests) {
      errors.push({
        field: "guests",
        message: `Maximum occupancy is ${maxGuests} guest(s) for this unit`,
      });
    }
  }

  if (requireGuestInfo) {
    if (!input.guestFirstName?.trim()) {
      errors.push({ field: "guestFirstName", message: "First name is required" });
    } else if (input.guestFirstName.length > MAX_NAME_LENGTH) {
      errors.push({ field: "guestFirstName", message: "First name is too long" });
    }

    if (!input.guestLastName?.trim()) {
      errors.push({ field: "guestLastName", message: "Last name is required" });
    } else if (input.guestLastName.length > MAX_NAME_LENGTH) {
      errors.push({ field: "guestLastName", message: "Last name is too long" });
    }

    if (!input.guestEmail?.trim() || !/.+@.+\..+/.test(input.guestEmail)) {
      errors.push({ field: "guestEmail", message: "Valid email is required" });
    } else if (input.guestEmail.length > MAX_EMAIL_LENGTH) {
      errors.push({ field: "guestEmail", message: "Email is too long" });
    }

    if (input.guestPhone && input.guestPhone.length > MAX_PHONE_LENGTH) {
      errors.push({ field: "guestPhone", message: "Phone number is too long" });
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
    infants: Number(raw.infants ?? 0),
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
