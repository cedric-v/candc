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
    // Per-week rate for optional indoor WC-shower access (covers the first
    // 7 nights, then CHF 10 per additional commenced week).
    wcShowerCleaningFeeChf: getNumberEnv(env, "WC_SHOWER_CLEANING_FEE_CHF", 10),
    touristTaxAdultChf: getNumberEnv(env, "TOURIST_TAX_ADULT_CHF", 3),
    paymentFeeRate: getNumberEnv(env, "PAYMENT_FEE_RATE", 0),
    paymentFeeFixedChf: getNumberEnv(env, "PAYMENT_FEE_FIXED_CHF", 0),
    // Durée (en minutes) pendant laquelle une réservation en attente de
    // paiement tient ses dates sur le calendrier. Configurable par env pour
    // ne pas hardcoder la règle métier (défaut 30 min).
    pendingPaymentHoldMinutes: getNumberEnv(env, "PENDING_PAYMENT_HOLD_MINUTES", 30),
    // Fenêtre (en minutes) avant expiration pendant laquelle un rappel de
    // paiement est envoyé au client. Bornée à la durée du hold : seules les
    // réservations dont le hold expire bientôt sont rappelées (défaut 20 min,
    // aligné sur la cadence de maintenance de ~20 min).
    pendingPaymentReminderWindowMinutes: getNumberEnv(env, "PENDING_PAYMENT_REMINDER_WINDOW_MINUTES", 20),
    // Durée (en mois) de conservation des données sensibles du voyageur
    // (n° de pièce d'identité, nationalité, date de naissance) après la fin
    // du séjour ; au-delà, elles sont anonymisées (NULL) par le job
    // `runSensitiveDataRetention` (LPD / RGPD). Défaut : 12 mois.
    sensitiveDataRetentionMonths: getNumberEnv(env, "SENSITIVE_DATA_RETENTION_MONTHS", 12),
    sumUpApiBaseUrl: env.SUMUP_API_BASE_URL || "https://api.sumup.com",
    sumUpApiKey: env.SUMUP_API_KEY || "",
    sumUpMerchantCode: env.SUMUP_MERCHANT_CODE || "",
    sumUpWebhookSecret: env.SUMUP_WEBHOOK_SECRET || "",
    internalSyncToken: env.INTERNAL_SYNC_TOKEN || "",
    adminAccessToken: env.ADMIN_ACCESS_TOKEN || "",
    // Durée de validité (jours) des liens de gestion (« gérer ma réservation »).
    // Après expiration, le client doit recevoir un nouveau lien par e-mail.
    manageTokenTtlDays: getNumberEnv(env, "MANAGE_TOKEN_TTL_DAYS", 365),
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
    reviewLinkParking: env.REVIEW_LINK_PARKING || "https://g.page/r/CbsI1IDQnZP4EBM/review",
    reviewLinkStudio: env.REVIEW_LINK_STUDIO || "https://g.page/r/Ca5HhJ5WSkT6EBM/review",
    ntfyTopicUrl: env.NTFY_TOPIC_URL || "",
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
