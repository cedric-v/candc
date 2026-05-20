import { getDefaultUnitByCode } from "./catalog.js";
import { enumerateNights } from "./date.js";
import { getConfig, requireDb } from "./env.js";

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
    return normalizeUnitRecord(unit);
  }

  const fallback = getDefaultUnitByCode(code);
  return fallback
    ? {
        id: null,
        code: fallback.code,
        unitType: fallback.unitType,
        publicReferencePrefix: fallback.publicReferencePrefix,
        displayName: fallback.displayName,
        currency: fallback.currency,
        defaultBaseRateChf: fallback.defaultBaseRateChf,
        checkInStartTime: fallback.checkInStartTime,
        checkInEndTime: fallback.checkInEndTime,
        checkOutTime: fallback.checkOutTime,
        maxConcurrentReservations: fallback.maxConcurrentReservations,
        includedBaseFeatures: fallback.includedBaseFeatures,
        settings: fallback.settings,
      }
    : null;
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

  return record ? normalizeUnitRecord(record) : null;
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

function normalizeUnitRecord(unit) {
  return {
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
    checkInStartTime: unit.check_in_start_time,
    checkInEndTime: unit.check_in_end_time,
    checkOutTime: unit.check_out_time,
    maxConcurrentReservations: Number(unit.max_concurrent_reservations || 1),
    includedBaseFeatures: unit.features_json ? JSON.parse(unit.features_json) : [],
    settings: unit.settings_json ? JSON.parse(unit.settings_json) : {},
  };
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
  const config = getConfig(env);
  const nights = enumerateNights(startDate, endDate);
  const periods = await getRatePeriodsForRange(env, unit.id, startDate, endDate);
  const fallbackRate = unit.defaultBaseRateChf ?? config.defaultBaseRateChf;

  return nights.map((nightDate) => {
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
}

export async function getAvailabilityConflicts(env, unitId, startDate, endDate) {
  const db = requireDb(env);
  const { results } = await db
    .prepare(
      `
        SELECT id, unit_id, source, external_uid, reservation_id, start_date, end_date, status
        FROM calendar_blocks
        WHERE unit_id IS ?
          AND status IN ('active', 'confirmed', 'pending_payment')
          AND start_date < ?
          AND end_date > ?
        ORDER BY start_date ASC
      `,
    )
    .bind(unitId, endDate, startDate)
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
            vehicle_type, vehicle_length_m, adults, children, remarks, guest_details_json,
            check_in_date, check_out_date, check_in_start_time, check_in_end_time, check_out_time,
            wc_shower_requested, wc_shower_confirmed, refundable_policy_type,
            booked_at, arrival_less_than_24h, base_rate_snapshot,
            base_amount, tourist_tax_amount, options_amount,
            long_stay_discount_amount, non_refundable_discount_amount,
            payment_fee_amount, total_amount, currency,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        reservation.remarks || null,
        JSON.stringify({
          vehicleType: reservation.vehicleType || null,
          vehicleLengthM: reservation.vehicleLengthM || null,
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
        pricing.longStayDiscountAmount,
        pricing.nonRefundableDiscountAmount,
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
          AND status IN ('pending_payment', 'confirmed', 'modified')
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
          payments.provider_checkout_id
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
