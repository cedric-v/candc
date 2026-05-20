export function getRequiredEnv(env, key) {
  const value = env[key];

  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function getNumberEnv(env, key, fallback) {
  const raw = env[key];

  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }

  const value = Number(raw);

  if (Number.isNaN(value)) {
    throw new Error(`Environment variable ${key} must be numeric`);
  }

  return value;
}

export function getConfig(env) {
  return {
    publicBaseUrl: getRequiredEnv(env, "PUBLIC_BASE_URL"),
    defaultUnitCode: env.DEFAULT_BOOKING_UNIT_CODE || "parking-space",
    defaultBaseRateChf: getNumberEnv(env, "DEFAULT_BASE_RATE_CHF", 20),
    timeZone: env.TIMEZONE || "Europe/Zurich",
    bookingIcsFeedToken: env.BOOKING_ICS_FEED_TOKEN || "",
    checkInTime: env.DEFAULT_CHECK_IN_TIME || "15:00:00",
    checkInEndTime: env.DEFAULT_CHECK_IN_END_TIME || "21:00:00",
    checkOutTime: env.DEFAULT_CHECK_OUT_TIME || "10:00:00",
    wcShowerCleaningFeeChf: getNumberEnv(env, "WC_SHOWER_CLEANING_FEE_CHF", 10),
    touristTaxAdultChf: getNumberEnv(env, "TOURIST_TAX_ADULT_CHF", 3),
    paymentFeeRate: getNumberEnv(env, "PAYMENT_FEE_RATE", 0),
    paymentFeeFixedChf: getNumberEnv(env, "PAYMENT_FEE_FIXED_CHF", 0),
    sumUpApiBaseUrl: env.SUMUP_API_BASE_URL || "https://api.sumup.com",
    sumUpApiKey: env.SUMUP_API_KEY || "",
    sumUpMerchantCode: env.SUMUP_MERCHANT_CODE || "",
    bookingIcsImportUrl: env.BOOKING_ICS_IMPORT_URL || "",
    internalSyncToken: env.INTERNAL_SYNC_TOKEN || "",
    googleCalendarId: env.GOOGLE_CALENDAR_ID || "",
    googleServiceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "",
    googleServiceAccountPrivateKey: (env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  };
}

export function requireDb(env) {
  if (!env.DB) {
    throw new Error("Missing D1 binding: DB");
  }

  return env.DB;
}
