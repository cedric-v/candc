import { diffNights, isArrivalWithin24Hours } from "./date.js";
import { getConfig } from "./env.js";
import { getNightlyRates, getUnitByCode } from "./db.js";

export async function buildQuote(env, input) {
  const config = getConfig(env);
  const nights = diffNights(input.checkInDate, input.checkOutDate);

  if (nights <= 0) {
    throw new Error("check_out_must_be_after_check_in");
  }

  const unit = await getUnitByCode(env, input.unitCode);

  if (!unit) {
    throw new Error("unknown_unit");
  }

  const nightlyRates = await getNightlyRates(env, unit, input.checkInDate, input.checkOutDate);
  const unitSettings = unit.settings || {};
  const adultTouristTaxChf =
    unitSettings.adultTouristTaxChf ?? config.touristTaxAdultChf;
  const wcShowerCleaningFeeChf =
    unitSettings.wcShowerCleaningFeeChf ?? config.wcShowerCleaningFeeChf;
  const longStayDiscountRate =
    unitSettings.longStayDiscountRate ?? 0.15;
  const nonRefundableDiscountRate =
    unitSettings.nonRefundableDiscountRate ?? 0.1;
  const allowsWcShowerOption =
    unitSettings.allowsWcShowerOption ?? true;
  const wcShowerRequested = allowsWcShowerOption ? Boolean(input.wcShowerRequested) : false;
  const baseAmount = roundMoney(nightlyRates.reduce((sum, night) => sum + night.rate, 0));
  const touristTaxAmount = roundMoney(adultTouristTaxChf * input.adults * nights);
  const optionsAmount = wcShowerRequested ? roundMoney(wcShowerCleaningFeeChf) : 0;
  const longStayDiscountAmount = nights >= 30 ? roundMoney(baseAmount * longStayDiscountRate) : 0;
  const arrivalLessThan24h = isArrivalWithin24Hours(
    input.checkInDate,
    unit.checkInStartTime || config.checkInTime,
    config.timeZone,
  );

  const canSelectNonRefundableDiscount = !arrivalLessThan24h;
  const appliedNonRefundable = arrivalLessThan24h || Boolean(input.nonRefundableSelected);
  const discountBase = baseAmount - longStayDiscountAmount;
  const nonRefundableDiscountAmount =
    !arrivalLessThan24h && input.nonRefundableSelected
      ? roundMoney(discountBase * nonRefundableDiscountRate)
      : 0;

  const subtotalBeforeFees =
    baseAmount +
    touristTaxAmount +
    optionsAmount -
    longStayDiscountAmount -
    nonRefundableDiscountAmount;

  const paymentFeeAmount = roundMoney(
    subtotalBeforeFees * config.paymentFeeRate + config.paymentFeeFixedChf,
  );
  const totalAmount = roundMoney(subtotalBeforeFees + paymentFeeAmount);

  return {
    unit: {
      id: unit.id,
      code: unit.code,
      unitType: unit.unitType,
      displayName: unit.displayName,
      settings: unitSettings,
    },
    currency: unit.currency || "CHF",
    nights,
    nightlyRates,
    baseAmount,
    touristTaxAmount,
    optionsAmount,
    longStayDiscountAmount,
    nonRefundableDiscountAmount,
    paymentFeeAmount,
    subtotalBeforeFees,
    totalAmount,
    arrivalLessThan24h,
    canSelectNonRefundableDiscount,
    nonRefundableApplied: appliedNonRefundable,
    refundablePolicyType: appliedNonRefundable ? "non_refundable" : "flexible_24h",
    includedBaseFeatures: unit.includedBaseFeatures,
    appliedOptions: {
      wcShowerRequested,
    },
  };
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
