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
const MAX_STREET_LENGTH = 200;
const MAX_CITY_LENGTH = 100;
const MAX_ZIP_LENGTH = 20;
const MAX_COUNTRY_LENGTH = 100;
const MAX_NATIONALITY_LENGTH = 100;
const MAX_ID_DOCUMENT_LENGTH = 50;

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

    if (!input.guestMobilePhone?.trim()) {
      errors.push({ field: "guestMobilePhone", message: "Mobile phone is required" });
    } else if (input.guestMobilePhone.length > MAX_PHONE_LENGTH) {
      errors.push({ field: "guestMobilePhone", message: "Mobile phone number is too long" });
    }

    if (!input.guestAddressStreet?.trim()) {
      errors.push({ field: "guestAddressStreet", message: "Street address is required" });
    } else if (input.guestAddressStreet.length > MAX_STREET_LENGTH) {
      errors.push({ field: "guestAddressStreet", message: "Street address is too long" });
    }

    if (!input.guestAddressZip?.trim()) {
      errors.push({ field: "guestAddressZip", message: "ZIP code is required" });
    } else if (input.guestAddressZip.length > MAX_ZIP_LENGTH) {
      errors.push({ field: "guestAddressZip", message: "ZIP code is too long" });
    }

    if (!input.guestAddressCity?.trim()) {
      errors.push({ field: "guestAddressCity", message: "City is required" });
    } else if (input.guestAddressCity.length > MAX_CITY_LENGTH) {
      errors.push({ field: "guestAddressCity", message: "City is too long" });
    }

    if (!input.guestAddressCountry?.trim()) {
      errors.push({ field: "guestAddressCountry", message: "Country is required" });
    } else if (input.guestAddressCountry.length > MAX_COUNTRY_LENGTH) {
      errors.push({ field: "guestAddressCountry", message: "Country is too long" });
    }

    if (!input.guestDateOfBirth?.trim()) {
      errors.push({ field: "guestDateOfBirth", message: "Date of birth is required" });
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(input.guestDateOfBirth)) {
      errors.push({ field: "guestDateOfBirth", message: "Date of birth must be in YYYY-MM-DD format" });
    }

    if (!input.guestNationality?.trim()) {
      errors.push({ field: "guestNationality", message: "Nationality is required" });
    } else if (input.guestNationality.length > MAX_NATIONALITY_LENGTH) {
      errors.push({ field: "guestNationality", message: "Nationality is too long" });
    }

    const nationality = (input.guestNationality || "").trim().toLowerCase();
    if (nationality !== "suisse" && nationality !== "swiss" && nationality !== "schweiz" && nationality !== "svizzera" && nationality !== "svizzero" && nationality !== "suíço" && nationality !== "zwitsers") {
      if (!input.guestIdDocumentNumber?.trim()) {
        errors.push({ field: "guestIdDocumentNumber", message: "ID document number is required for non-Swiss guests" });
      } else if (input.guestIdDocumentNumber.length > MAX_ID_DOCUMENT_LENGTH) {
        errors.push({ field: "guestIdDocumentNumber", message: "ID document number is too long" });
      }
    }

    if (input.additionalGuests) {
      if (!Array.isArray(input.additionalGuests)) {
        errors.push({ field: "additionalGuests", message: "Additional guests must be an array" });
      } else {
        const totalPeople = (input.adults || 0) + (input.children || 0) + (input.infants || 0);
        const additionalCount = input.additionalGuests.length;
        const mainGuestCount = 1;
        if (additionalCount + mainGuestCount > totalPeople) {
          errors.push({ field: "additionalGuests", message: "More additional guests listed than total travellers" });
        }
        input.additionalGuests.forEach((g, i) => {
          if (!g.firstName?.trim()) {
            errors.push({ field: `additionalGuests[${i}].firstName`, message: "Additional guest first name is required" });
          } else if (g.firstName.length > MAX_NAME_LENGTH) {
            errors.push({ field: `additionalGuests[${i}].firstName`, message: "Additional guest first name is too long" });
          }
          if (!g.lastName?.trim()) {
            errors.push({ field: `additionalGuests[${i}].lastName`, message: "Additional guest last name is required" });
          } else if (g.lastName.length > MAX_NAME_LENGTH) {
            errors.push({ field: `additionalGuests[${i}].lastName`, message: "Additional guest last name is too long" });
          }
        });
      }
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
    guestMobilePhone: typeof raw.guestMobilePhone === "string" ? raw.guestMobilePhone.trim() : "",
    guestAddressStreet: typeof raw.guestAddressStreet === "string" ? raw.guestAddressStreet.trim() : "",
    guestAddressZip: typeof raw.guestAddressZip === "string" ? raw.guestAddressZip.trim() : "",
    guestAddressCity: typeof raw.guestAddressCity === "string" ? raw.guestAddressCity.trim() : "",
    guestAddressCountry: typeof raw.guestAddressCountry === "string" ? raw.guestAddressCountry.trim() : "",
    guestDateOfBirth: typeof raw.guestDateOfBirth === "string" ? raw.guestDateOfBirth.trim() : "",
    guestNationality: typeof raw.guestNationality === "string" ? raw.guestNationality.trim() : "",
    guestIdDocumentNumber: typeof raw.guestIdDocumentNumber === "string" ? raw.guestIdDocumentNumber.trim() : "",
    additionalGuests: Array.isArray(raw.additionalGuests) ? raw.additionalGuests.map((g) => ({
      firstName: typeof g.firstName === "string" ? g.firstName.trim() : "",
      lastName: typeof g.lastName === "string" ? g.lastName.trim() : "",
    })) : [],
    acceptedTerms: Boolean(raw.acceptedTerms),
  };
}
