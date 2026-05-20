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
  return calculateQuoteFromResolvedUnit(unit, nightlyRates, input, config);
}

export function calculateQuoteFromResolvedUnit(unit, nightlyRates, input, config) {
  const nights = diffNights(input.checkInDate, input.checkOutDate);
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
  const includedAdultsCount =
    Number(unitSettings.includedAdultsCount ?? 0);
  const extraAdultNightlyRateChf =
    Number(unitSettings.extraAdultNightlyRateChf ?? 0);
  const extraChildNightlyRateChf =
    Number(unitSettings.extraChildNightlyRateChf ?? 0);
  const weeklyStayDiscountRate =
    Number(unitSettings.weeklyStayDiscountRate ?? 0);
  const weeklyStayThresholdNights =
    Number(unitSettings.weeklyStayThresholdNights ?? 0);
  const cleaningFeeChf =
    Number(unitSettings.cleaningFeeChf ?? 0);
  const cleaningFeeThresholdNights =
    Number(unitSettings.cleaningFeeThresholdNights ?? 0);
  const wcShowerRequested = allowsWcShowerOption ? Boolean(input.wcShowerRequested) : false;
  const baseAmount = roundMoney(nightlyRates.reduce((sum, night) => sum + night.rate, 0));
  const extraAdultCount = Math.max(0, Number(input.adults || 0) - includedAdultsCount);
  const guestSurchargeAmount = roundMoney(
    (extraAdultCount * extraAdultNightlyRateChf * nights) +
    (Number(input.children || 0) * extraChildNightlyRateChf * nights),
  );
  const touristTaxAmount = roundMoney(adultTouristTaxChf * input.adults * nights);

  const cleaningFeeAmount = (cleaningFeeChf > 0 && nights < cleaningFeeThresholdNights)
    ? roundMoney(cleaningFeeChf)
    : 0;
  const optionsAmount = (wcShowerRequested ? roundMoney(wcShowerCleaningFeeChf) : 0) + cleaningFeeAmount;

  const accommodationAmount = roundMoney(baseAmount + guestSurchargeAmount);
  const longStayDiscountAmount = nights >= 30
    ? roundMoney(accommodationAmount * longStayDiscountRate)
    : 0;
  const arrivalLessThan24h = isArrivalWithin24Hours(
    input.checkInDate,
    unit.checkInStartTime || config.checkInTime,
    config.timeZone,
  );

  const canSelectNonRefundableDiscount = !arrivalLessThan24h;
  const appliedNonRefundable = arrivalLessThan24h || Boolean(input.nonRefundableSelected);
  const discountBase = accommodationAmount - longStayDiscountAmount;
  const nonRefundableDiscountAmount =
    !arrivalLessThan24h && input.nonRefundableSelected
      ? roundMoney(discountBase * nonRefundableDiscountRate)
      : 0;
  const weeklyStayDiscountAmount =
    weeklyStayThresholdNights > 0 && nights >= weeklyStayThresholdNights
      ? roundMoney((discountBase - nonRefundableDiscountAmount) * weeklyStayDiscountRate)
      : 0;

  const subtotalBeforeFees =
    baseAmount +
    guestSurchargeAmount +
    touristTaxAmount +
    optionsAmount -
    longStayDiscountAmount -
    nonRefundableDiscountAmount -
    weeklyStayDiscountAmount;

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
    guestSurchargeAmount,
    touristTaxAmount,
    optionsAmount,
    longStayDiscountAmount,
    nonRefundableDiscountAmount,
    weeklyStayDiscountAmount,
    paymentFeeAmount,
    subtotalBeforeFees,
    totalAmount,
    arrivalLessThan24h,
    canSelectNonRefundableDiscount,
    nonRefundableApplied: appliedNonRefundable,
    refundablePolicyType: appliedNonRefundable ? "non_refundable" : "flexible_48h",
    includedBaseFeatures: unit.includedBaseFeatures,
    appliedOptions: {
      wcShowerRequested,
    },
  };
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
