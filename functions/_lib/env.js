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
    timeZone: env.TIMEZONE || "Europe/Zurich",
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
    internalSyncToken: env.INTERNAL_SYNC_TOKEN || "",
    adminAccessToken: env.ADMIN_ACCESS_TOKEN || "",
    adminNotificationEmail: env.ADMIN_NOTIFICATION_EMAIL || "bonjour@candc.ch",
    emailFrom: env.EMAIL_FROM || "",
    emailReplyTo: env.EMAIL_REPLY_TO || "",
    resendApiKey: env.RESEND_API_KEY || "",
    wifiStudioPassword: env.WIFI_STUDIO_PASSWORD || "__WIFI_STUDIO_PASSWORD__",
    wifiTerracePassword: env.WIFI_TERRACE_PASSWORD || "__WIFI_TERRACE_PASSWORD__",
    keyBoxStudioCode: env.KEY_BOX_STUDIO_CODE || "__KEY_BOX_STUDIO_CODE__",
    garageInstructionsJson: env.GARAGE_INSTRUCTIONS || "{}",
    whatsappLine: env.WHATSAPP_LINE || "__WHATSAPP_LINE__",
    studioAddress: env.STUDIO_ADDRESS || "__STUDIO_ADDRESS__",
    enableGoogleCalendarSync: String(env.ENABLE_GOOGLE_CALENDAR_SYNC || "false") === "true",
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
