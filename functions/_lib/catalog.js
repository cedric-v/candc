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
    defaultBaseRateChf: null,
    checkInStartTime: "15:00:00",
    checkInEndTime: "21:00:00",
    checkOutTime: "10:00:00",
    maxConcurrentReservations: 1,
    includedBaseFeatures: [],
    settings: {
      requiresVehicleType: false,
      allowsWcShowerOption: false,
      adultTouristTaxChf: 3,
      wcShowerCleaningFeeChf: 0,
      longStayDiscountRate: 0,
      nonRefundableDiscountRate: 0.1,
      minStayNights: 5,
    },
  },
];

export function getDefaultUnitByCode(unitCode = DEFAULT_UNIT_CODE) {
  return DEFAULT_UNITS.find((unit) => unit.code === unitCode) || DEFAULT_UNITS[0];
}
