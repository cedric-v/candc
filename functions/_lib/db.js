import { getDefaultUnitByCode } from "./catalog.js";
import { enumerateNights } from "./date.js";
import { getConfig, requireDb } from "./env.js";

function redactSecret(value, visibleChars = 6) {
  if (!value || typeof value !== "string") {
    return null;
  }

  if (value.length <= visibleChars) {
    return "***";
  }

  return `***${value.slice(-visibleChars)}`;
}

export async function getUnitByCode(env, unitCode) {
  const db = requireDb(env);
  const code = unitCode || getConfig(env).defaultUnitCode;
  const unit = await db
    .prepare(
      `
        SELECT
          id,
          code,
          unit_type,
          public_reference_prefix,
          display_name,
          currency,
          default_base_rate,
          google_calendar_id,
          check_in_start_time,
          check_in_end_time,
          check_out_time,
          max_concurrent_reservations,
          features_json,
          settings_json,
          is_active
        FROM rentable_units
        WHERE code = ?
          AND is_active = 1
        LIMIT 1
      `,
    )
    .bind(code)
    .first();

  if (unit) {
    return normalizeUnitRecord(unit, env);
  }

  const fallback = getDefaultUnitByCode(code);
  const normalizedFallback = fallback
    ? {
        id: null,
        code: fallback.code,
        unitType: fallback.unitType,
        publicReferencePrefix: fallback.publicReferencePrefix,
        displayName: fallback.displayName,
        currency: fallback.currency,
        defaultBaseRateChf: fallback.defaultBaseRateChf,
        googleCalendarId: fallback.googleCalendarId || null,
        checkInStartTime: fallback.checkInStartTime,
        checkInEndTime: fallback.checkInEndTime,
        checkOutTime: fallback.checkOutTime,
        maxConcurrentReservations: fallback.maxConcurrentReservations,
        includedBaseFeatures: fallback.includedBaseFeatures,
        settings: { ...fallback.settings },
      }
    : null;

  if (normalizedFallback && env) {
    const envKey = `MIN_STAY_NIGHTS_${normalizedFallback.code.toUpperCase().replace("-", "_")}`;
    if (env[envKey] !== undefined && env[envKey] !== null && env[envKey] !== "") {
      const val = Number(env[envKey]);
      if (!Number.isNaN(val)) {
        normalizedFallback.settings.minStayNights = val;
      }
    }
  }

  return normalizedFallback;
}

export async function getUnitByFeedToken(env, feedToken) {
  const db = requireDb(env);
  const record = await db
    .prepare(
      `
        SELECT
          rentable_units.id,
          rentable_units.code,
          rentable_units.unit_type,
          rentable_units.public_reference_prefix,
          rentable_units.display_name,
          rentable_units.currency,
          rentable_units.default_base_rate,
          rentable_units.google_calendar_id,
          rentable_units.check_in_start_time,
          rentable_units.check_in_end_time,
          rentable_units.check_out_time,
          rentable_units.max_concurrent_reservations,
          rentable_units.features_json,
          rentable_units.settings_json,
          rentable_units.is_active
        FROM rentable_units
        INNER JOIN external_calendar_sources
          ON external_calendar_sources.unit_id = rentable_units.id
        WHERE external_calendar_sources.export_feed_token = ?
          AND external_calendar_sources.is_active = 1
          AND rentable_units.is_active = 1
        LIMIT 1
      `,
    )
    .bind(feedToken)
    .first();

  return record ? normalizeUnitRecord(record, env) : null;
}

export async function getImportCalendarSources(env, sourceCode = "booking", unitCode = null) {
  const db = requireDb(env);
  const sql = unitCode
    ? `
        SELECT
          external_calendar_sources.id,
          external_calendar_sources.unit_id,
          external_calendar_sources.source_code,
          external_calendar_sources.source_kind,
          external_calendar_sources.import_url,
          external_calendar_sources.export_feed_token,
          external_calendar_sources.is_reference,
          rentable_units.code AS unit_code,
          rentable_units.display_name,
          rentable_units.unit_type
        FROM external_calendar_sources
        INNER JOIN rentable_units ON rentable_units.id = external_calendar_sources.unit_id
        WHERE external_calendar_sources.source_code = ?
          AND external_calendar_sources.source_kind = 'ics'
          AND external_calendar_sources.is_active = 1
          AND rentable_units.is_active = 1
          AND rentable_units.code = ?
        ORDER BY external_calendar_sources.is_reference DESC, rentable_units.code ASC
      `
    : `
        SELECT
          external_calendar_sources.id,
          external_calendar_sources.unit_id,
          external_calendar_sources.source_code,
          external_calendar_sources.source_kind,
          external_calendar_sources.import_url,
          external_calendar_sources.export_feed_token,
          external_calendar_sources.is_reference,
          rentable_units.code AS unit_code,
          rentable_units.display_name,
          rentable_units.unit_type
        FROM external_calendar_sources
        INNER JOIN rentable_units ON rentable_units.id = external_calendar_sources.unit_id
        WHERE external_calendar_sources.source_code = ?
          AND external_calendar_sources.source_kind = 'ics'
          AND external_calendar_sources.is_active = 1
          AND rentable_units.is_active = 1
        ORDER BY external_calendar_sources.is_reference DESC, rentable_units.code ASC
      `;

  const stmt = db.prepare(sql);
  const query = unitCode ? stmt.bind(sourceCode, unitCode) : stmt.bind(sourceCode);
  const { results } = await query.all();
  return results || [];
}

export async function getLatestCalendarSyncForUnit(env, unitId, sourceCode = "booking") {
  const db = requireDb(env);
  return db
    .prepare(
      `
        SELECT last_synced_at
        FROM external_calendar_sources
        WHERE unit_id = ?
          AND source_code = ?
          AND is_active = 1
          AND is_reference = 1
        ORDER BY updated_at DESC
        LIMIT 1
      `,
    )
    .bind(unitId, sourceCode)
    .first();
}

function applyUnitEnvironmentOverrides(unitRecord, env) {
  if (!env || !unitRecord?.code) {
    return unitRecord;
  }

  const envKey = `MIN_STAY_NIGHTS_${unitRecord.code.toUpperCase().replaceAll("-", "_")}`;
  const rawValue = env[envKey];

  if (rawValue !== undefined && rawValue !== null && rawValue !== "") {
    const value = Number(rawValue);
    if (!Number.isNaN(value)) {
      unitRecord.settings = {
        ...unitRecord.settings,
        minStayNights: value,
      };
    }
  }

  return unitRecord;
}

function normalizeUnitRecord(unit, env) {
  const normalized = {
    id: unit.id,
    code: unit.code,
    unitType: unit.unit_type,
    publicReferencePrefix: unit.public_reference_prefix,
    displayName: unit.display_name,
    currency: unit.currency,
    defaultBaseRateChf:
      unit.default_base_rate === null || unit.default_base_rate === undefined
        ? null
        : Number(unit.default_base_rate),
    googleCalendarId: unit.google_calendar_id || null,
    checkInStartTime: unit.check_in_start_time,
    checkInEndTime: unit.check_in_end_time,
    checkOutTime: unit.check_out_time,
    maxConcurrentReservations: Number(unit.max_concurrent_reservations || 1),
    includedBaseFeatures: unit.features_json ? JSON.parse(unit.features_json) : [],
    settings: unit.settings_json ? JSON.parse(unit.settings_json) : {},
  };

  return applyUnitEnvironmentOverrides(normalized, env);
}

export async function getRatePeriodsForRange(env, unitId, startDate, endDate) {
  const db = requireDb(env);

  const { results } = await db
    .prepare(
      `
        SELECT id, unit_id, start_date, end_date, nightly_base_rate, label, priority
        FROM rate_periods
        WHERE unit_id IS ?
          AND is_active = 1
          AND start_date < ?
          AND end_date > ?
        ORDER BY priority DESC, start_date ASC
      `,
    )
    .bind(unitId, endDate, startDate)
    .all();

  return results || [];
}

export async function getNightlyRates(env, unit, startDate, endDate) {
  const nights = enumerateNights(startDate, endDate);
  const periods = await getRatePeriodsForRange(env, unit.id, startDate, endDate);
  const fallbackRate = unit.defaultBaseRateChf;

  const nightlyRates = nights.map((nightDate) => {
    const matchedPeriod = periods.find(
      (period) => period.start_date <= nightDate && period.end_date > nightDate,
    );

    return {
      date: nightDate,
      rate: matchedPeriod ? Number(matchedPeriod.nightly_base_rate) : fallbackRate,
      ratePeriodId: matchedPeriod?.id || null,
      label: matchedPeriod?.label || "default",
    };
  });

  if (nightlyRates.some((night) => night.rate === null || night.rate === undefined)) {
    throw new Error("unit_base_rate_not_configured");
  }

  return nightlyRates;
}

export async function getAvailabilityConflicts(env, unitId, startDate, endDate) {
  const db = requireDb(env);
  const { results } = await db
    .prepare(
      `
        SELECT id, unit_id, source, external_uid, reservation_id, start_date, end_date, status
        FROM calendar_blocks
        WHERE unit_id IS ?
          AND (status IN ('active', 'confirmed') OR (status = 'pending_payment' AND created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 minutes')))
          AND start_date < ?
          AND end_date > ?
        ORDER BY start_date ASC
      `,
    )
    .bind(unitId, endDate, startDate)
    .all();

  return results || [];
}

export async function getAvailabilityConflictsExcludingReservation(
  env,
  unitId,
  startDate,
  endDate,
  reservationId,
) {
  const db = requireDb(env);
  const { results } = await db
    .prepare(
      `
        SELECT id, unit_id, source, external_uid, reservation_id, start_date, end_date, status
        FROM calendar_blocks
        WHERE unit_id IS ?
          AND (status IN ('active', 'confirmed') OR (status = 'pending_payment' AND created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 minutes')))
          AND start_date < ?
          AND end_date > ?
          AND (reservation_id IS NULL OR reservation_id != ?)
        ORDER BY start_date ASC
      `,
    )
    .bind(unitId, endDate, startDate, reservationId)
    .all();

  return results || [];
}

export async function insertPendingReservation(env, unit, reservation, pricing, manageTokenHash) {
  const db = requireDb(env);
  const reservationId = crypto.randomUUID();
  const prefix = unit.publicReferencePrefix || "BOOK";
  const publicReference = `${prefix}-${reservation.checkInDate.replaceAll("-", "")}-${reservationId.slice(0, 8).toUpperCase()}`;
  const nowIso = new Date().toISOString();
  const calendarBlockId = crypto.randomUUID();
  const tokenId = crypto.randomUUID();

  await db.batch([
    db
      .prepare(
        `
          INSERT INTO reservations (
            id, unit_id, unit_code, public_reference, locale, source, status,
            guest_first_name, guest_last_name, guest_email, guest_phone,
            vehicle_type, vehicle_length_m, adults, children, infants, remarks, guest_details_json,
            check_in_date, check_out_date, check_in_start_time, check_in_end_time, check_out_time,
            wc_shower_requested, wc_shower_confirmed, refundable_policy_type,
            booked_at, arrival_less_than_24h, base_rate_snapshot,
            base_amount, tourist_tax_amount, options_amount, guest_surcharge_amount,
            long_stay_discount_amount, non_refundable_discount_amount, weekly_stay_discount_amount,
            payment_fee_amount, total_amount, currency,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        reservationId,
        unit.id,
        unit.code,
        publicReference,
        reservation.locale || "fr",
        "direct",
        "pending_payment",
        reservation.guestFirstName,
        reservation.guestLastName,
        reservation.guestEmail,
        reservation.guestPhone || null,
        reservation.vehicleType || null,
        reservation.vehicleLengthM || null,
        reservation.adults,
        reservation.children,
        reservation.infants || 0,
        reservation.remarks || null,
        JSON.stringify({
          vehicleType: reservation.vehicleType || null,
          vehicleLengthM: reservation.vehicleLengthM || null,
          infants: reservation.infants || 0,
          wcShowerRequested: Boolean(reservation.wcShowerRequested),
        }),
        reservation.checkInDate,
        reservation.checkOutDate,
        reservation.checkInStartTime,
        reservation.checkInEndTime,
        reservation.checkOutTime,
        reservation.wcShowerRequested ? 1 : 0,
        0,
        pricing.refundablePolicyType,
        nowIso,
        pricing.arrivalLessThan24h ? 1 : 0,
        JSON.stringify(pricing.nightlyRates),
        pricing.baseAmount,
        pricing.touristTaxAmount,
        pricing.optionsAmount,
        pricing.guestSurchargeAmount || 0,
        pricing.longStayDiscountAmount,
        pricing.nonRefundableDiscountAmount,
        pricing.weeklyStayDiscountAmount || 0,
        pricing.paymentFeeAmount,
        pricing.totalAmount,
        pricing.currency,
        nowIso,
        nowIso,
      ),
    db
      .prepare(
        `
          INSERT INTO calendar_blocks (
            id, unit_id, source, external_uid, reservation_id, start_date, end_date, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        calendarBlockId,
        unit.id,
        "direct",
        null,
        reservationId,
        reservation.checkInDate,
        reservation.checkOutDate,
        "pending_payment",
        nowIso,
        nowIso,
      ),
    db
      .prepare(
        `
          INSERT INTO booking_tokens (
            id, reservation_id, token_hash, purpose, expires_at, revoked_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        tokenId,
        reservationId,
        manageTokenHash,
        "manage_booking",
        null,
        null,
        nowIso,
      ),
  ]);

  return {
    reservationId,
    publicReference,
  };
}

export async function getReservationsForIcsFeed(env, unitId) {
  const db = requireDb(env);
  const { results } = await db
    .prepare(
      `
        SELECT
          id,
          unit_code,
          public_reference,
          guest_first_name,
          guest_last_name,
          check_in_date,
          check_out_date,
          status
        FROM reservations
        WHERE unit_id IS ?
          AND status IN ('pending_payment', 'pending_adjustment_payment', 'confirmed', 'modified', 'refund_due', 'pending_refund')
        ORDER BY check_in_date ASC
      `,
    )
    .bind(unitId)
    .all();

  return results || [];
}

export async function replaceExternalCalendarBlocks(env, sourceRecord, events) {
  const db = requireDb(env);
  const nowIso = new Date().toISOString();
  const sourceTag = `${sourceRecord.source_code}_${sourceRecord.source_kind}`;
  const statements = [
    db
      .prepare(
        `
          DELETE FROM calendar_blocks
          WHERE unit_id = ?
            AND reservation_id IS NULL
            AND source = ?
        `,
      )
      .bind(sourceRecord.unit_id, sourceTag),
  ];

  for (const event of events) {
    statements.push(
      db
        .prepare(
          `
            INSERT INTO calendar_blocks (
              id, unit_id, source, external_uid, reservation_id, start_date, end_date, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .bind(
          crypto.randomUUID(),
          sourceRecord.unit_id,
          sourceTag,
          event.uid,
          null,
          event.startDate,
          event.endDate,
          "active",
          nowIso,
          nowIso,
        ),
    );
  }

  await db.batch(statements);
}

export async function updateCalendarSourceSync(env, sourceId, syncStatus) {
  const db = requireDb(env);
  const nowIso = new Date().toISOString();
  await db
    .prepare(
      `
        UPDATE external_calendar_sources
        SET last_synced_at = ?, updated_at = ?
        WHERE id = ?
      `,
    )
    .bind(nowIso, nowIso, sourceId)
    .run();

  if (syncStatus) {
    await insertSyncLog(env, {
      unitId: syncStatus.unitId || null,
      syncType: syncStatus.syncType,
      status: syncStatus.status,
      message: syncStatus.message || null,
      payloadSummary: syncStatus.payloadSummary || null,
    });
  }
}

export async function insertSyncLog(env, log) {
  const db = requireDb(env);
  await db
    .prepare(
      `
        INSERT INTO sync_logs (
          id, unit_id, sync_type, status, message, payload_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      crypto.randomUUID(),
      log.unitId || null,
      log.syncType,
      log.status,
      log.message || null,
      log.payloadSummary ? JSON.stringify(log.payloadSummary) : null,
      new Date().toISOString(),
    )
    .run();
}

export async function insertPaymentRecord(env, payment) {
  const db = requireDb(env);
  const paymentId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      `
        INSERT INTO payments (
          id, reservation_id, provider, provider_checkout_id, provider_payment_reference,
          type, status, amount, currency, raw_payload, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      paymentId,
      payment.reservationId,
      payment.provider,
      payment.providerCheckoutId || null,
      payment.providerPaymentReference || null,
      payment.type,
      payment.status,
      payment.amount,
      payment.currency,
      payment.rawPayload ? JSON.stringify(payment.rawPayload) : null,
      nowIso,
      nowIso,
    )
    .run();

  return paymentId;
}

export async function updatePaymentByCheckoutId(env, checkoutId, updates) {
  const db = requireDb(env);
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      `
        UPDATE payments
        SET
          provider_payment_reference = COALESCE(?, provider_payment_reference),
          status = COALESCE(?, status),
          raw_payload = COALESCE(?, raw_payload),
          updated_at = ?
        WHERE provider_checkout_id = ?
      `,
    )
    .bind(
      updates.providerPaymentReference || null,
      updates.status || null,
      updates.rawPayload ? JSON.stringify(updates.rawPayload) : null,
      nowIso,
      checkoutId,
    )
    .run();
}

export async function updateReservationAndCalendarStatus(env, reservationId, reservationStatus, calendarBlockStatus) {
  const db = requireDb(env);
  const nowIso = new Date().toISOString();

  await db.batch([
    db
      .prepare(
        `
          UPDATE reservations
          SET status = ?, updated_at = ?
          WHERE id = ?
        `,
      )
      .bind(reservationStatus, nowIso, reservationId),
    db
      .prepare(
        `
          UPDATE calendar_blocks
          SET status = ?, updated_at = ?
          WHERE reservation_id = ?
        `,
      )
      .bind(calendarBlockStatus, nowIso, reservationId),
  ]);
}

export async function markReservationPaymentSetupFailed(env, reservationId, reason) {
  const db = requireDb(env);
  const nowIso = new Date().toISOString();

  await db.batch([
    db
      .prepare(
        `
          UPDATE reservations
          SET status = 'payment_setup_failed', updated_at = ?, remarks = TRIM(COALESCE(remarks, '') || ?)
          WHERE id = ?
        `,
      )
      .bind(nowIso, `\n[payment_setup_failed] ${reason}`, reservationId),
    db
      .prepare(
        `
          UPDATE calendar_blocks
          SET status = 'released', updated_at = ?
          WHERE reservation_id = ?
        `,
      )
      .bind(nowIso, reservationId),
  ]);
}

export async function getReservationByCheckoutId(env, checkoutId) {
  const db = requireDb(env);
  return db
    .prepare(
      `
        SELECT
          reservations.id,
          reservations.unit_id,
          reservations.unit_code,
          reservations.public_reference,
          reservations.status,
          reservations.guest_email,
          payments.provider_checkout_id,
          payments.type AS payment_type
        FROM reservations
        INNER JOIN payments ON payments.reservation_id = reservations.id
        WHERE payments.provider_checkout_id = ?
        LIMIT 1
      `,
    )
    .bind(checkoutId)
    .first();
}

export async function getReservationForCalendarSync(env, reservationId) {
  const db = requireDb(env);
  return db
    .prepare(
      `
        SELECT
          reservations.id,
          reservations.unit_id,
          reservations.unit_code,
          reservations.public_reference,
          reservations.locale,
          reservations.status,
          reservations.guest_first_name,
          reservations.guest_last_name,
          reservations.guest_email,
          reservations.guest_phone,
          reservations.vehicle_type,
          reservations.vehicle_length_m,
          reservations.adults,
          reservations.children,
          reservations.infants,
          reservations.remarks,
          reservations.check_in_date,
          reservations.check_out_date,
          reservations.check_in_start_time,
          reservations.check_in_end_time,
          reservations.check_out_time,
          reservations.wc_shower_requested,
          reservations.wc_shower_confirmed,
          reservations.total_amount,
          reservations.currency,
          reservations.google_calendar_event_id,
          rentable_units.unit_type,
          rentable_units.display_name AS unit_display_name,
          rentable_units.google_calendar_id,
          (
            SELECT payments.status
            FROM payments
            WHERE payments.reservation_id = reservations.id
            ORDER BY payments.created_at DESC
            LIMIT 1
          ) AS payment_status
        FROM reservations
        LEFT JOIN rentable_units ON rentable_units.id = reservations.unit_id
        WHERE reservations.id = ?
        LIMIT 1
      `,
    )
    .bind(reservationId)
    .first();
}

export async function updateReservationGoogleCalendarEventId(env, reservationId, eventId) {
  const db = requireDb(env);
  await db
    .prepare(
      `
        UPDATE reservations
        SET google_calendar_event_id = ?, updated_at = ?
        WHERE id = ?
      `,
    )
    .bind(eventId, new Date().toISOString(), reservationId)
    .run();
}

export async function getReservationForManageToken(env, tokenHash) {
  const db = requireDb(env);
  return db
    .prepare(
      `
        SELECT
          reservations.id,
          reservations.unit_id,
          reservations.unit_code,
          reservations.public_reference,
          reservations.locale,
          reservations.status,
          reservations.guest_first_name,
          reservations.guest_last_name,
          reservations.guest_email,
          reservations.guest_phone,
          reservations.vehicle_type,
          reservations.vehicle_length_m,
          reservations.adults,
          reservations.children,
          reservations.infants,
          reservations.remarks,
          reservations.check_in_date,
          reservations.check_out_date,
          reservations.check_in_start_time,
          reservations.check_in_end_time,
          reservations.check_out_time,
          reservations.wc_shower_requested,
          reservations.wc_shower_confirmed,
          reservations.refundable_policy_type,
          reservations.booked_at,
          reservations.arrival_less_than_24h,
          reservations.base_rate_snapshot,
          reservations.base_amount,
          reservations.tourist_tax_amount,
          reservations.options_amount,
          reservations.long_stay_discount_amount,
          reservations.non_refundable_discount_amount,
          reservations.payment_fee_amount,
          reservations.total_amount,
          reservations.currency,
          reservations.google_calendar_event_id,
          rentable_units.unit_type,
          rentable_units.display_name AS unit_display_name,
          rentable_units.google_calendar_id,
          (
            SELECT payments.status
            FROM payments
            WHERE payments.reservation_id = reservations.id
            ORDER BY payments.created_at DESC
            LIMIT 1
          ) AS payment_status
        FROM booking_tokens
        INNER JOIN reservations ON reservations.id = booking_tokens.reservation_id
        LEFT JOIN rentable_units ON rentable_units.id = reservations.unit_id
        WHERE booking_tokens.token_hash = ?
          AND booking_tokens.purpose = 'manage_booking'
          AND booking_tokens.revoked_at IS NULL
          AND (booking_tokens.expires_at IS NULL OR booking_tokens.expires_at > ?)
        LIMIT 1
      `,
    )
    .bind(tokenHash, new Date().toISOString())
    .first();
}

export async function getReservationForEmail(env, reservationId) {
  const db = requireDb(env);
  return db
    .prepare(
      `
        SELECT
          reservations.*,
          rentable_units.unit_type,
          rentable_units.display_name AS unit_display_name,
          rentable_units.google_calendar_id,
          (
            SELECT payments.status
            FROM payments
            WHERE payments.reservation_id = reservations.id
            ORDER BY payments.created_at DESC
            LIMIT 1
          ) AS payment_status
        FROM reservations
        LEFT JOIN rentable_units ON rentable_units.id = reservations.unit_id
        WHERE reservations.id = ?
        LIMIT 1
      `,
    )
    .bind(reservationId)
    .first();
}

export async function getPaymentsForReservation(env, reservationId) {
  const db = requireDb(env);
  const { results } = await db
    .prepare(
      `
        SELECT
          id,
          provider,
          provider_checkout_id,
          provider_payment_reference,
          type,
          status,
          amount,
          currency,
          raw_payload,
          created_at,
          updated_at
        FROM payments
        WHERE reservation_id = ?
        ORDER BY created_at DESC
      `,
    )
    .bind(reservationId)
    .all();

  return results || [];
}

export async function getReservationByPublicReference(env, publicReference) {
  const db = requireDb(env);
  return db
    .prepare(
      `
        SELECT
          reservations.id,
          reservations.unit_id,
          reservations.unit_code,
          reservations.public_reference,
          reservations.locale,
          reservations.status,
          reservations.guest_first_name,
          reservations.guest_last_name,
          reservations.guest_email,
          reservations.check_in_date,
          reservations.check_out_date,
          reservations.total_amount,
          reservations.currency,
          rentable_units.unit_type,
          rentable_units.display_name AS unit_display_name,
          (
            SELECT payments.status
            FROM payments
            WHERE payments.reservation_id = reservations.id
            ORDER BY payments.created_at DESC
            LIMIT 1
          ) AS payment_status
        FROM reservations
        LEFT JOIN rentable_units ON rentable_units.id = reservations.unit_id
        WHERE reservations.public_reference = ?
        LIMIT 1
      `,
    )
    .bind(publicReference)
    .first();
}

export async function updateReservationBookingDetails(env, reservationId, updates) {
  const db = requireDb(env);
  const nowIso = new Date().toISOString();

  await db.batch([
    db
      .prepare(
        `
          UPDATE reservations
          SET
            check_in_date = ?,
            check_out_date = ?,
            check_in_start_time = ?,
            check_in_end_time = ?,
            check_out_time = ?,
            adults = ?,
            children = ?,
            infants = ?,
            vehicle_type = ?,
            vehicle_length_m = ?,
            remarks = ?,
            guest_details_json = ?,
            wc_shower_requested = ?,
            refundable_policy_type = ?,
            arrival_less_than_24h = ?,
            base_rate_snapshot = ?,
            base_amount = ?,
            tourist_tax_amount = ?,
            options_amount = ?,
            guest_surcharge_amount = ?,
            long_stay_discount_amount = ?,
            non_refundable_discount_amount = ?,
            weekly_stay_discount_amount = ?,
            payment_fee_amount = ?,
            total_amount = ?,
            status = ?,
            updated_at = ?
          WHERE id = ?
        `,
      )
      .bind(
        updates.checkInDate,
        updates.checkOutDate,
        updates.checkInStartTime,
        updates.checkInEndTime,
        updates.checkOutTime,
        updates.adults,
        updates.children,
        updates.infants || 0,
        updates.vehicleType || null,
        updates.vehicleLengthM ?? null,
        updates.remarks || null,
        JSON.stringify({
          vehicleType: updates.vehicleType || null,
          vehicleLengthM: updates.vehicleLengthM ?? null,
          infants: updates.infants || 0,
          wcShowerRequested: Boolean(updates.wcShowerRequested),
        }),
        updates.wcShowerRequested ? 1 : 0,
        updates.refundablePolicyType,
        updates.arrivalLessThan24h ? 1 : 0,
        JSON.stringify(updates.baseRateSnapshot),
        updates.baseAmount,
        updates.touristTaxAmount,
        updates.optionsAmount,
        updates.guestSurchargeAmount || 0,
        updates.longStayDiscountAmount,
        updates.nonRefundableDiscountAmount,
        updates.weeklyStayDiscountAmount || 0,
        updates.paymentFeeAmount,
        updates.totalAmount,
        updates.status,
        nowIso,
        reservationId,
      ),
    db
      .prepare(
        `
          UPDATE calendar_blocks
          SET
            start_date = ?,
            end_date = ?,
            status = ?,
            updated_at = ?
          WHERE reservation_id = ?
        `,
      )
      .bind(
        updates.checkInDate,
        updates.checkOutDate,
        updates.calendarBlockStatus,
        nowIso,
        reservationId,
      ),
  ]);
}

export async function cancelReservation(env, reservationId) {
  const db = requireDb(env);
  const nowIso = new Date().toISOString();

  await db.batch([
    db
      .prepare(
        `
          UPDATE reservations
          SET status = 'cancelled', updated_at = ?
          WHERE id = ?
        `,
      )
      .bind(nowIso, reservationId),
    db
      .prepare(
        `
          UPDATE calendar_blocks
          SET status = 'released', updated_at = ?
          WHERE reservation_id = ?
        `,
      )
      .bind(nowIso, reservationId),
  ]);
}

export async function releaseExpiredPendingPayments(env) {
  const db = requireDb(env);
  const nowIso = new Date().toISOString();

  // Expire blocks older than 30 minutes
  await db.batch([
    db.prepare(`
      UPDATE calendar_blocks
      SET status = 'released', updated_at = ?
      WHERE status = 'pending_payment'
        AND created_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 minutes')
    `).bind(nowIso),
    db.prepare(`
      UPDATE reservations
      SET status = 'payment_setup_failed', updated_at = ?, remarks = TRIM(COALESCE(remarks, '') || ?)
      WHERE status = 'pending_payment'
        AND created_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 minutes')
    `).bind(nowIso, "\n[automatic_release] Stale pending payment block released.")
  ]);
}

export async function insertEmailLog(env, emailLog) {
  const db = requireDb(env);
  await db
    .prepare(
      `
        INSERT INTO email_logs (
          id, reservation_id, email_type, recipient, status, provider_message_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      crypto.randomUUID(),
      emailLog.reservationId || null,
      emailLog.emailType,
      emailLog.recipient,
      emailLog.status,
      emailLog.providerMessageId || null,
      new Date().toISOString(),
    )
    .run();
}

export async function hasSuccessfulEmailLog(env, reservationId, emailType, recipient) {
  const db = requireDb(env);
  const record = await db
    .prepare(
      `
        SELECT id
        FROM email_logs
        WHERE reservation_id = ?
          AND email_type = ?
          AND recipient = ?
          AND status = 'sent'
        LIMIT 1
      `,
    )
    .bind(reservationId, emailType, recipient)
    .first();

  return Boolean(record);
}

export async function hasSuccessfulEmailLogForDate(env, reservationId, emailType, recipient, targetDate) {
  const db = requireDb(env);
  const record = await db
    .prepare(
      `
        SELECT id
        FROM email_logs
        WHERE reservation_id = ?
          AND email_type = ?
          AND recipient = ?
          AND status = 'sent'
          AND substr(created_at, 1, 10) = ?
        LIMIT 1
      `,
    )
    .bind(reservationId, emailType, recipient, targetDate)
    .first();

  return Boolean(record);
}

export async function getArrivalReservationsForDate(env, isoDate) {
  const db = requireDb(env);
  const { results } = await db
    .prepare(
      `
        SELECT
          reservations.*,
          rentable_units.unit_type,
          rentable_units.display_name AS unit_display_name
        FROM reservations
        LEFT JOIN rentable_units ON rentable_units.id = reservations.unit_id
        WHERE reservations.check_in_date = ?
          AND reservations.status IN ('confirmed', 'modified', 'refund_due', 'pending_refund')
        ORDER BY reservations.check_in_date ASC, reservations.public_reference ASC
      `,
    )
    .bind(isoDate)
    .all();

  return results || [];
}

export async function listAdminReservations(env, limit = 50) {
  const db = requireDb(env);
  const { results } = await db
    .prepare(
      `
        SELECT
          reservations.id,
          reservations.public_reference,
          reservations.unit_code,
          reservations.status,
          reservations.guest_first_name,
          reservations.guest_last_name,
          reservations.guest_email,
          reservations.check_in_date,
          reservations.check_out_date,
          reservations.total_amount,
          reservations.currency,
          reservations.wc_shower_requested,
          rentable_units.display_name AS unit_display_name,
          (
            SELECT payments.status
            FROM payments
            WHERE payments.reservation_id = reservations.id
            ORDER BY payments.created_at DESC
            LIMIT 1
          ) AS payment_status
        FROM reservations
        LEFT JOIN rentable_units ON rentable_units.id = reservations.unit_id
        ORDER BY reservations.check_in_date DESC, reservations.created_at DESC
        LIMIT ?
      `,
    )
    .bind(limit)
    .all();

  return results || [];
}

export async function listUnitsForAdmin(env) {
  const db = requireDb(env);
  const { results } = await db
    .prepare(
      `
        SELECT
          id,
          code,
          unit_type,
          display_name,
          default_base_rate,
          settings_json,
          google_calendar_id,
          is_active
        FROM rentable_units
        ORDER BY display_name ASC
      `,
    )
    .all();

  return (results || []).map((unit) => ({
    ...unit,
    settings: unit.settings_json ? JSON.parse(unit.settings_json) : {},
  }));
}

export async function listCalendarHealthForAdmin(env) {
  const db = requireDb(env);
  const { results } = await db
    .prepare(
      `
        SELECT
          external_calendar_sources.id,
          external_calendar_sources.unit_id,
          external_calendar_sources.source_code,
          external_calendar_sources.import_url,
          external_calendar_sources.export_feed_token,
          external_calendar_sources.is_reference,
          external_calendar_sources.last_synced_at,
          rentable_units.code AS unit_code,
          rentable_units.display_name AS unit_display_name,
          (
            SELECT sync_logs.status
            FROM sync_logs
            WHERE sync_logs.unit_id = external_calendar_sources.unit_id
              AND sync_logs.sync_type = external_calendar_sources.source_code || '_ics_import'
            ORDER BY sync_logs.created_at DESC
            LIMIT 1
          ) AS last_status,
          (
            SELECT sync_logs.message
            FROM sync_logs
            WHERE sync_logs.unit_id = external_calendar_sources.unit_id
              AND sync_logs.sync_type = external_calendar_sources.source_code || '_ics_import'
            ORDER BY sync_logs.created_at DESC
            LIMIT 1
          ) AS last_message,
          (
            SELECT sync_logs.created_at
            FROM sync_logs
            WHERE sync_logs.unit_id = external_calendar_sources.unit_id
              AND sync_logs.sync_type = external_calendar_sources.source_code || '_ics_import'
            ORDER BY sync_logs.created_at DESC
            LIMIT 1
          ) AS last_log_at,
          (
            SELECT COUNT(*)
            FROM calendar_blocks
            WHERE calendar_blocks.unit_id = external_calendar_sources.unit_id
              AND calendar_blocks.source = external_calendar_sources.source_code
              AND calendar_blocks.external_uid IS NOT NULL
              AND calendar_blocks.status IN ('active', 'confirmed')
              AND calendar_blocks.end_date >= date('now')
          ) AS future_block_count
        FROM external_calendar_sources
        INNER JOIN rentable_units ON rentable_units.id = external_calendar_sources.unit_id
        WHERE external_calendar_sources.source_kind = 'ics'
          AND external_calendar_sources.is_active = 1
          AND rentable_units.is_active = 1
        ORDER BY rentable_units.display_name ASC, external_calendar_sources.source_code ASC
      `,
    )
    .all();

  return (results || []).map((row) => ({
    ...row,
    import_url: redactSecret(row.import_url),
    export_feed_token: redactSecret(row.export_feed_token),
  }));
}

export async function listOperationalJobHealth(env) {
  const db = requireDb(env);
  const { results } = await db
    .prepare(
      `
        SELECT
          sync_type,
          status,
          message,
          payload_summary,
          created_at
        FROM sync_logs
        WHERE sync_type IN ('calendar_sync_job', 'arrival_email_job', 'calendar_source_validation')
        ORDER BY created_at DESC
      `,
    )
    .all();

  const latestByType = new Map();
  for (const row of results || []) {
    if (!latestByType.has(row.sync_type)) {
      latestByType.set(row.sync_type, row);
    }
  }

  return {
    calendarSyncJob: latestByType.get("calendar_sync_job") || null,
    arrivalEmailJob: latestByType.get("arrival_email_job") || null,
    calendarValidationJob: latestByType.get("calendar_source_validation") || null,
  };
}

export async function listRatePeriods(env, unitCode = null) {
  const db = requireDb(env);
  const sql = unitCode
    ? `
        SELECT
          rate_periods.id,
          rate_periods.unit_id,
          rate_periods.start_date,
          rate_periods.end_date,
          rate_periods.nightly_base_rate,
          rate_periods.label,
          rate_periods.priority,
          rate_periods.is_active,
          rentable_units.code AS unit_code,
          rentable_units.display_name AS unit_display_name
        FROM rate_periods
        LEFT JOIN rentable_units ON rentable_units.id = rate_periods.unit_id
        WHERE rentable_units.code = ?
        ORDER BY rate_periods.start_date ASC, rate_periods.priority DESC
      `
    : `
        SELECT
          rate_periods.id,
          rate_periods.unit_id,
          rate_periods.start_date,
          rate_periods.end_date,
          rate_periods.nightly_base_rate,
          rate_periods.label,
          rate_periods.priority,
          rate_periods.is_active,
          rentable_units.code AS unit_code,
          rentable_units.display_name AS unit_display_name
        FROM rate_periods
        LEFT JOIN rentable_units ON rentable_units.id = rate_periods.unit_id
        ORDER BY rentable_units.display_name ASC, rate_periods.start_date ASC, rate_periods.priority DESC
      `;
  const query = unitCode ? db.prepare(sql).bind(unitCode) : db.prepare(sql);
  const { results } = await query.all();
  return results || [];
}

export async function upsertRatePeriod(env, ratePeriod) {
  const db = requireDb(env);
  const id = ratePeriod.id || crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      `
        INSERT INTO rate_periods (
          id, unit_id, start_date, end_date, nightly_base_rate, label, priority, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          unit_id = excluded.unit_id,
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          nightly_base_rate = excluded.nightly_base_rate,
          label = excluded.label,
          priority = excluded.priority,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at
      `,
    )
    .bind(
      id,
      ratePeriod.unitId,
      ratePeriod.startDate,
      ratePeriod.endDate,
      ratePeriod.nightlyBaseRate,
      ratePeriod.label || null,
      ratePeriod.priority ?? 100,
      ratePeriod.isActive ? 1 : 0,
      nowIso,
      nowIso,
    )
    .run();

  return id;
}

export async function updateUnitSettings(env, unitId, settings) {
  const db = requireDb(env);
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      `
        UPDATE rentable_units
        SET settings_json = ?, updated_at = ?
        WHERE id = ?
      `,
    )
    .bind(JSON.stringify(settings || {}), nowIso, unitId)
    .run();
}

export async function listRecentSyncLogs(env, limit = 20) {
  const db = requireDb(env);
  const { results } = await db
    .prepare(
      `
        SELECT
          sync_logs.id,
          sync_logs.sync_type,
          sync_logs.status,
          sync_logs.message,
          sync_logs.payload_summary,
          sync_logs.created_at,
          rentable_units.code AS unit_code,
          rentable_units.display_name AS unit_display_name
        FROM sync_logs
        LEFT JOIN rentable_units ON rentable_units.id = sync_logs.unit_id
        ORDER BY sync_logs.created_at DESC
        LIMIT ?
      `,
    )
    .bind(limit)
    .all();

  return (results || []).map((row) => ({
    id: row.id,
    sync_type: row.sync_type,
    status: row.status,
    message: row.message,
    created_at: row.created_at,
    unit_code: row.unit_code,
    unit_display_name: row.unit_display_name,
  }));
}
