export const DEFAULT_UNIT_CODE = "parking-space";

export const DEFAULT_UNITS = [
  {
    code: "parking-space",
    unitType: "parking",
    publicReferencePrefix: "PARK",
    displayName: "C&C Parking Space",
    currency: "CHF",
    defaultBaseRateChf: 20,
    checkInStartTime: "15:00:00",
    checkInEndTime: "21:00:00",
    checkOutTime: "10:00:00",
    maxConcurrentReservations: 1,
    includedBaseFeatures: [
      "electricity",
      "drinking_water",
      "waste_disposal",
      "private_terrace",
    ],
    settings: {
      requiresVehicleType: true,
      allowsWcShowerOption: true,
      adultTouristTaxChf: 3,
      wcShowerCleaningFeeChf: 10,
      longStayDiscountRate: 0.15,
      nonRefundableDiscountRate: 0.1,
      minStayNights: 1,
    },
  },
  {
    code: "eco-studio",
    unitType: "studio",
    publicReferencePrefix: "STUDIO",
    displayName: "C&C Eco Studio",
    currency: "CHF",
    defaultBaseRateChf: 99,
    checkInStartTime: "15:00:00",
    checkInEndTime: "21:00:00",
    checkOutTime: "10:00:00",
    maxConcurrentReservations: 1,
    includedBaseFeatures: ["free_parking_one_vehicle", "private_terrace"],
    settings: {
      requiresVehicleType: false,
      allowsWcShowerOption: false,
      adultTouristTaxChf: 3,
      wcShowerCleaningFeeChf: 0,
      includedAdultsCount: 1,
      extraAdultNightlyRateChf: 7,
      extraChildNightlyRateChf: 5,
      longStayDiscountRate: 0.15,
      nonRefundableDiscountRate: 0.1,
      weeklyStayDiscountRate: 0.05,
      weeklyStayThresholdNights: 7,
      minStayNights: 1,
      maxGuests: 4,
      supportsInfants: true,
    },
  },
];

export function getDefaultUnitByCode(unitCode = DEFAULT_UNIT_CODE) {
  return DEFAULT_UNITS.find((unit) => unit.code === unitCode) || DEFAULT_UNITS[0];
}
