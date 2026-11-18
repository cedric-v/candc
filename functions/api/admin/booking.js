import { hasValidAdminToken } from "../../_lib/auth.js";
import {
  createManageToken,
  createManualCalendarBlock,
  deleteManualCalendarBlock,
  deleteRatePeriod,
  getReservationForEmail,
  getUnitByCode,
  insertSyncLog,
  listCalendarHealthForAdmin,
  listAdminReservations,
  listManualCalendarBlocks,
  listOperationalJobHealth,
  listRatePeriods,
  listRecentEmailLogs,
  listRecentSyncLogs,
  listUnitsForAdmin,
  listUpcomingExternalCalendarBlocks,
  setReservationWcConfirmation,
  updateReservationBookingDetails,
  updateReservationAndCalendarStatus,
  updateUnitSettings,
  upsertRatePeriod,
} from "../../_lib/db.js";
import { getConfig } from "../../_lib/env.js";
import { getCurrentIsoDateInZone, isIsoDateString, diffNights } from "../../_lib/date.js";
import { runArrivalEmails, runBookingIcsSync, runSensitiveDataRetention, validateCalendarSources } from "../../_lib/jobs.js";
import { attemptAutomaticRefund } from "../../_lib/refunds.js";
import { buildQuote } from "../../_lib/pricing.js";
import { normalizeBookingInput } from "../../_lib/validation.js";
import { sendReservationEmail, syncReservationToGoogleCalendar } from "../../_lib/booking-ops.js";
import { badRequest, json, serverError, unauthorized } from "../../_lib/http.js";

// Les réponses admin contiennent des données personnelles (dashboard) et
// parfois un lien de gestion frais (rotate_manage_token) : jamais de cache
// navigateur/intermédiaire.
function jsonNoStore(data, init = {}) {
  return json(data, {
    ...init,
    headers: { ...(init.headers || {}), "cache-control": "no-store" },
  });
}

// `payload_summary` est stocké en JSON texte : l'historique admin le renvoie
// déjà désérialisé (avant/après des dates, montants, remboursement). Toute
// valeur illisible est ignorée plutôt que de casser le panneau.
function parsePayloadSummary(raw) {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// Types d'e-mail qu'un renvoi manuel peut rejouer depuis l'admin. Volontairement
// limité aux e-mails d'information client : `admin_new_booking` (alerte interne)
// et les e-mails de paiement automatiques (relance / expiration, liés à un hold)
// n'ont pas de sens hors de leur cycle de vie.
const RESENDABLE_EMAIL_TYPES = [
  "booking_confirmation",
  "booking_modification",
  "arrival_instructions",
  "departure_instructions",
  "review_request",
];

export async function onRequestGet(context) {
  try {
    if (!(await hasValidAdminToken(context.request, context.env))) {
      return unauthorized("Missing or invalid admin token");
    }

    const url = new URL(context.request.url);

    // Historique d'une réservation, chargé à la demande depuis « Details ▾ »
    // (le dashboard charge sinon 25 entrées globales, tous types confondus :
    // un changement de dates disparaît de la vue en quelques heures).
    const historyReservationId = url.searchParams.get("history");

    if (historyReservationId) {
      const [historyLogs, historyEmails] = await Promise.all([
        listRecentSyncLogs(context.env, 50, { reservationId: historyReservationId }),
        listRecentEmailLogs(context.env, 50, { reservationId: historyReservationId }),
      ]);

      return jsonNoStore({
        reservationId: historyReservationId,
        history: historyLogs.map((log) => ({
          id: log.id,
          when: log.created_at,
          type: log.sync_type,
          status: log.status,
          message: log.message || null,
          payload: parsePayloadSummary(log.payload_summary),
        })),
        emails: historyEmails.map((email) => ({
          id: email.id,
          when: email.created_at,
          type: email.email_type,
          recipient: email.recipient,
          status: email.status,
          deliveryStatus: email.delivery_status || null,
        })),
      });
    }

    const todayIso = getCurrentIsoDateInZone(getConfig(context.env).timeZone);
    const reservationOptions = {
      scope: url.searchParams.get("scope") || "upcoming",
      statusGroup: url.searchParams.get("status") || "active",
      unitCode: url.searchParams.get("unit") || null,
      limit: Number(url.searchParams.get("limit") || 100),
      todayIso,
    };

    const [
      units,
      reservations,
      ratePeriods,
      syncLogs,
      calendarHealth,
      operationalHealth,
      manualBlocks,
      externalBlocks,
      emailLogs,
    ] = await Promise.all([
      listUnitsForAdmin(context.env),
      listAdminReservations(context.env, reservationOptions),
      listRatePeriods(context.env),
      listRecentSyncLogs(context.env, 25),
      listCalendarHealthForAdmin(context.env),
      listOperationalJobHealth(context.env),
      listManualCalendarBlocks(context.env),
      listUpcomingExternalCalendarBlocks(context.env, todayIso),
      listRecentEmailLogs(context.env, 80),
    ]);

    return jsonNoStore({
      units,
      reservations,
      ratePeriods,
      syncLogs,
      calendarHealth,
      operationalHealth,
      manualBlocks,
      externalBlocks,
      emailLogs,
    });
  } catch (error) {
    console.error("Failed to load admin dashboard:", error);
    return serverError("Failed to load admin dashboard");
  }
}

export async function onRequestPost(context) {
  try {
    if (!(await hasValidAdminToken(context.request, context.env))) {
      return unauthorized("Missing or invalid admin token");
    }

    const payload = await context.request.json();
    const action = payload?.action;

    if (action === "delete_rate_period") {
      const ratePeriodId = payload.ratePeriodId;

      if (!ratePeriodId) {
        return badRequest("ratePeriodId is required");
      }

      const changes = await deleteRatePeriod(context.env, ratePeriodId);

      if (!changes) {
        return badRequest("Unknown pricing period");
      }

      return jsonNoStore({ ok: true, action, ratePeriodId });
    }

    if (action === "create_rate_period") {
      if (!payload.unitId) {
        return badRequest("unitId is required");
      }

      if (!isIsoDateString(payload.startDate) || !isIsoDateString(payload.endDate)) {
        return badRequest("startDate and endDate must use YYYY-MM-DD");
      }

      if (Number.isNaN(Number(payload.nightlyBaseRate))) {
        return badRequest("nightlyBaseRate must be numeric");
      }

      const ratePeriodId = await upsertRatePeriod(context.env, {
        unitId: payload.unitId,
        startDate: payload.startDate,
        endDate: payload.endDate,
        nightlyBaseRate: Number(payload.nightlyBaseRate),
        label: typeof payload.label === "string" ? payload.label.trim() : "",
        priority: Number(payload.priority || 100),
        isActive: payload.isActive !== false,
      });

      return jsonNoStore({
        ok: true,
        action,
        ratePeriodId,
      });
    }

    if (action === "update_long_stay_discounts") {
      if (!payload.unitId) {
        return badRequest("unitId is required");
      }

      const units = await listUnitsForAdmin(context.env);
      const unit = units.find((item) => item.id === payload.unitId);

      if (!unit) {
        return badRequest("Unknown unit");
      }

      const tiers = Array.isArray(payload.tiers) ? payload.tiers : [];
      const normalizedTiers = tiers
        .map((tier) => ({
          minNights: Number(tier?.minNights || 0),
          rate: Number(tier?.rate || 0),
        }))
        .filter((tier) => tier.minNights > 0 && tier.rate > 0);

      if (normalizedTiers.some((tier) => !Number.isFinite(tier.minNights) || !Number.isFinite(tier.rate))) {
        return badRequest("All tier values must be numeric");
      }

      const dedupedTiers = normalizedTiers
        .sort((left, right) => left.minNights - right.minNights)
        .filter(
          (tier, index, list) =>
            list.findIndex((candidate) => candidate.minNights === tier.minNights) === index,
        );

      const nextSettings = {
        ...(unit.settings || {}),
        longStayDiscountTiers: dedupedTiers,
      };

      await updateUnitSettings(context.env, payload.unitId, nextSettings);

      return jsonNoStore({
        ok: true,
        action,
        unitId: payload.unitId,
        tiers: dedupedTiers,
      });
    }

    if (action === "update_wc_confirmation") {
      // Option A : l'admin confirme ou révoque manuellement l'accès WC-douche
      // d'une réservation. Une révocation rembourse automatiquement la portion
      // WC (tarif unit-level ou défaut) via la mécanique de refunds existante.
      const reservationId = payload.reservationId;
      const wcConfirmed = Boolean(payload.wcConfirmed);

      if (!reservationId) {
        return badRequest("reservationId is required");
      }

      const reservation = await getReservationForEmail(context.env, reservationId);

      if (!reservation) {
        return badRequest("Unknown reservation");
      }

      if (!reservation.wc_shower_requested) {
        return badRequest("This reservation has no WC/shower access requested");
      }

      if (Boolean(reservation.wc_shower_confirmed) === wcConfirmed) {
        return jsonNoStore({ ok: true, action, wcConfirmed, noop: true });
      }

      await setReservationWcConfirmation(context.env, reservationId, wcConfirmed);

      let refund = null;
      if (!wcConfirmed && reservation.payment_status === "paid") {
        const nights = diffNights(reservation.check_in_date, reservation.check_out_date);
        const config = getConfig(context.env);
        const unit = await getUnitByCode(context.env, reservation.unit_code);
        const wcFeeChf =
          Number(unit?.settings?.wcShowerCleaningFeeChf) || config.wcShowerCleaningFeeChf;
        const wcAmount = Math.ceil(nights / 7) * wcFeeChf;

        if (wcAmount > 0) {
          refund = await attemptAutomaticRefund(
            context.env,
            reservation,
            wcAmount,
            "wc_shower_access_revoked_by_host",
            { reservationId },
          );

          await insertSyncLog(context.env, {
            unitId: reservation.unit_id || null,
            syncType: "wc_confirmation",
            status: refund.mode === "manual" ? "warning" : "info",
            message: `WC/shower access revoked by host for ${reservation.public_reference}; refund ${refund.mode} (${refund.amount} ${reservation.currency})`,
            payloadSummary: { reservationId, wcConfirmed: false, refund },
          });
        }
      }

      try {
        await syncReservationToGoogleCalendar(context.env, reservationId);
      } catch {
        // Les erreurs de sync calendrier ne doivent pas bloquer l'action admin.
      }

      return jsonNoStore({ ok: true, action, wcConfirmed, refund });
    }

    if (action === "create_calendar_block") {
      // Blocage manuel de dates depuis l'admin (ex. une période marquée
      // indisponible sur Booking.com mais absente de son flux iCal).
      const unitId = payload.unitId;

      if (!unitId) {
        return badRequest("unitId is required");
      }

      if (!isIsoDateString(payload.startDate) || !isIsoDateString(payload.endDate)) {
        return badRequest("startDate and endDate must use YYYY-MM-DD");
      }

      if (payload.endDate <= payload.startDate) {
        return badRequest("endDate must be after startDate");
      }

      const units = await listUnitsForAdmin(context.env);
      if (!units.some((unit) => unit.id === unitId)) {
        return badRequest("Unknown unit");
      }

      const note = typeof payload.note === "string" ? payload.note.trim().slice(0, 200) : "";
      const blockId = await createManualCalendarBlock(context.env, {
        unitId,
        startDate: payload.startDate,
        endDate: payload.endDate,
        note,
      });

      await insertSyncLog(context.env, {
        unitId,
        syncType: "manual_calendar_block",
        status: "info",
        message: `Blocage manuel créé du ${payload.startDate} au ${payload.endDate}`,
        payloadSummary: {
          blockId,
          unitId,
          startDate: payload.startDate,
          endDate: payload.endDate,
          note: note || null,
        },
      });

      return jsonNoStore({ ok: true, action, blockId });
    }

    if (action === "delete_calendar_block") {
      const blockId = payload.blockId;

      if (!blockId) {
        return badRequest("blockId is required");
      }

      const changes = await deleteManualCalendarBlock(context.env, blockId);

      if (!changes) {
        return badRequest("Unknown manual calendar block");
      }

      return jsonNoStore({ ok: true, action, blockId });
    }

    if (action === "rotate_manage_token") {
      // Rotation EXPLICITE uniquement : c'est le seul cas (avec l'annulation)
      // où un lien de gestion est révoqué. Utilisé quand le client a perdu son
      // lien (ou qu'il a fuité) : les e-mails automatiques, eux, ne rotatent
      // jamais (voir AGENTS.md, « Management links »).
      const reservationId = payload.reservationId;

      if (!reservationId) {
        return badRequest("reservationId is required");
      }

      const reservation = await getReservationForEmail(context.env, reservationId);

      if (!reservation) {
        return badRequest("Unknown reservation");
      }

      if (reservation.status === "cancelled") {
        return badRequest("A cancelled reservation has no active management link");
      }

      const manageToken = await createManageToken(context.env, reservationId, { rotate: true });
      const manageUrl = `${getConfig(context.env).publicBaseUrl}/booking/manage/${manageToken}`;

      // Le token lui-même n'est jamais journalisé (logs = données moins
      // protégées que la table booking_tokens, qui ne stocke que son hash).
      await insertSyncLog(context.env, {
        unitId: reservation.unit_id || null,
        syncType: "manage_token_rotation",
        status: "success",
        message: `Management link regenerated by admin for ${reservation.public_reference} (previous links revoked)`,
        payloadSummary: { reservationId },
      });

      return jsonNoStore({
        ok: true,
        action,
        publicReference: reservation.public_reference,
        manageUrl,
      });
    }

    if (action === "resend_email") {
      // Renvoi EXPLICITE d'un e-mail déjà envoyé (client qui affirme ne rien
      // avoir reçu, bounce côté Resend — voir le job `runEmailDeliveryCheck`).
      // Volontairement sans déduplication : c'est une action humaine. Le lien
      // de gestion est réémis sans rotation (les liens déjà reçus restent
      // valides), conformément à AGENTS.md (« Management links »).
      const reservationId = payload.reservationId;
      const emailType = payload.emailType;

      if (!reservationId) {
        return badRequest("reservationId is required");
      }

      if (!RESENDABLE_EMAIL_TYPES.includes(emailType)) {
        return badRequest(`emailType must be one of: ${RESENDABLE_EMAIL_TYPES.join(", ")}`);
      }

      const reservation = await getReservationForEmail(context.env, reservationId);

      if (!reservation) {
        return badRequest("Unknown reservation");
      }

      if (reservation.status === "cancelled") {
        return badRequest("A cancelled reservation cannot receive customer emails");
      }

      const response = await sendReservationEmail(context.env, reservationId, emailType, {
        manageTokenFactory: () => createManageToken(context.env, reservationId),
      });

      if (!response.ok) {
        return serverError(
          response.reason === "email_not_configured"
            ? "Email is not configured on this deployment"
            : "Failed to send the email",
        );
      }

      await insertSyncLog(context.env, {
        unitId: reservation.unit_id || null,
        syncType: "email_resend",
        status: response.skipped ? "skipped" : "success",
        message: response.skipped
          ? `Email ${emailType} resend skipped for ${reservation.public_reference} (${response.reason || "skipped"})`
          : `Email ${emailType} resent by admin for ${reservation.public_reference}`,
        payloadSummary: { reservationId, emailType, reason: response.reason || null },
      });

      return jsonNoStore({
        ok: true,
        action,
        emailType,
        publicReference: reservation.public_reference,
        recipient: response.skipped ? null : reservation.guest_email,
        skipped: Boolean(response.skipped),
        reason: response.reason || null,
      });
    }

    if (action === "early_departure") {
      // Départ anticipé géré par l'hôte (standard Booking.com / Airbnb :
      // « Modify booking » / « Change reservation ») : on raccourcit le séjour
      // en cours, ce qui libère immédiatement les nuits restantes (direct +
      // feed ICS export → les OTA rouvrent aussi) sans annuler la réservation.
      // - Remboursement des nuits restantes : à la discrétion de l'hôte
      //   (Booking.com ne rembourse pas un départ anticipé sur un tarif non
      //   remboursable ; il le rembourse sur un tarif flexible). Sans
      //   remboursement, les montants facturés restent inchangés (cohérence
      //   comptable : payé = total de la réservation).
      // - E-mail client : également à la discrétion de l'hôte.
      // Contrairement au flux client (page de gestion), le check-in peut être
      // dans le passé : un départ anticipé concerne par définition un séjour
      // déjà commencé. La relecture OTA live est volontairement absente : la
      // réservation est déjà confirmée et exportée (règle DB-only du spec).
      const reservationId = payload.reservationId;

      if (!reservationId) {
        return badRequest("reservationId is required");
      }

      if (!isIsoDateString(payload.newCheckOutDate)) {
        return badRequest("newCheckOutDate must use YYYY-MM-DD");
      }

      const refundUnusedNights = Boolean(payload.refundUnusedNights);
      const sendEmail = Boolean(payload.sendEmail);

      const reservation = await getReservationForEmail(context.env, reservationId);

      if (!reservation) {
        return badRequest("Unknown reservation");
      }

      if (reservation.status === "cancelled") {
        return badRequest("A cancelled reservation cannot be shortened");
      }

      if (!["confirmed", "modified"].includes(reservation.status)) {
        return badRequest("Early departure is only available for confirmed reservations");
      }

      if (payload.newCheckOutDate <= reservation.check_in_date) {
        return badRequest("New departure must be after the arrival date");
      }

      if (payload.newCheckOutDate >= reservation.check_out_date) {
        return badRequest("New departure must be before the current departure date");
      }

      const unit = await getUnitByCode(context.env, reservation.unit_code);

      if (!unit) {
        return badRequest("Unknown unit");
      }

      let additionalGuests = [];
      try {
        const parsedGuests = JSON.parse(reservation.additional_guests_json || "[]");
        if (Array.isArray(parsedGuests)) {
          additionalGuests = parsedGuests;
        }
      } catch {
        // additionalGuests reste [] : jamais bloquant pour un départ anticipé.
      }

      // Même payload que le flux client (buildEditablePayload) : on reprécalcule
      // le devis sur le séjour raccourci, en conservant la politique de
      // remboursement ORIGINALE de la réservation (non recalculée sur
      // « arrival < 24 h », ce qui n'aurait pas de sens pour un séjour commencé).
      const quotePayload = normalizeBookingInput({
        unitCode: reservation.unit_code,
        locale: reservation.locale,
        checkInDate: reservation.check_in_date,
        checkOutDate: payload.newCheckOutDate,
        vehicleType: reservation.vehicle_type,
        vehicleLengthM: reservation.vehicle_length_m,
        adults: reservation.adults,
        children: reservation.children,
        infants: reservation.infants || 0,
        wcShowerRequested: Boolean(reservation.wc_shower_requested),
        nonRefundableSelected: reservation.refundable_policy_type === "non_refundable",
        remarks: reservation.remarks || "",
        guestFirstName: reservation.guest_first_name,
        guestLastName: reservation.guest_last_name,
        guestEmail: reservation.guest_email,
        guestPhone: reservation.guest_phone || "",
        additionalGuests,
        acceptedTerms: true,
      });

      const quote = await buildQuote(context.env, quotePayload);
      const previousTotal = Number(reservation.total_amount || 0);
      const nextTotal = Number(quote.totalAmount || 0);
      const deltaAmount = Math.round((nextTotal - previousTotal + Number.EPSILON) * 100) / 100;

      if (refundUnusedNights && deltaAmount > 0) {
        return badRequest("Shortening the stay cannot increase the total; check the new departure date");
      }

      const sharedUpdates = {
        checkInDate: reservation.check_in_date,
        checkOutDate: payload.newCheckOutDate,
        checkInStartTime: reservation.check_in_start_time,
        checkInEndTime: reservation.check_in_end_time,
        checkOutTime: reservation.check_out_time,
        adults: reservation.adults,
        children: reservation.children,
        infants: reservation.infants || 0,
        vehicleType: reservation.vehicle_type,
        vehicleLengthM: reservation.vehicle_length_m,
        remarks: reservation.remarks,
        guestFirstName: reservation.guest_first_name,
        guestLastName: reservation.guest_last_name,
        guestPhone: reservation.guest_phone,
        guestMobilePhone: reservation.guest_mobile_phone,
        guestAddressStreet: reservation.guest_address_street,
        guestAddressZip: reservation.guest_address_zip,
        guestAddressCity: reservation.guest_address_city,
        guestAddressCountry: reservation.guest_address_country,
        guestDateOfBirth: reservation.guest_date_of_birth,
        guestNationality: reservation.guest_nationality,
        guestIdDocumentNumber: reservation.guest_id_document_number,
        additionalGuests,
        wcShowerRequested: Boolean(reservation.wc_shower_requested),
        refundablePolicyType: reservation.refundable_policy_type,
        arrivalLessThan24h: Boolean(reservation.arrival_less_than_24h),
        calendarBlockStatus: "confirmed",
      };

      let reservationStatus = reservation.status;
      let refund = null;

      if (refundUnusedNights) {
        // Mêmes statuts que le flux client : « modified » (delta payé ajusté)
        // ou « pending_refund » si le remboursement automatique n'a pu couvrir
        // la totalité (relance manuelle de l'hôte).
        reservationStatus = "modified";
        await updateReservationBookingDetails(context.env, reservationId, {
          ...sharedUpdates,
          baseRateSnapshot: quote.nightlyRates,
          baseAmount: quote.baseAmount,
          touristTaxAmount: quote.touristTaxAmount,
          optionsAmount: quote.optionsAmount,
          guestSurchargeAmount: quote.guestSurchargeAmount,
          longStayDiscountAmount: quote.longStayDiscountAmount,
          nonRefundableDiscountAmount: quote.nonRefundableDiscountAmount,
          weeklyStayDiscountAmount: quote.weeklyStayDiscountAmount || 0,
          paymentFeeAmount: quote.paymentFeeAmount,
          totalAmount: nextTotal,
          status: reservationStatus,
        });

        if (deltaAmount < 0) {
          refund = await attemptAutomaticRefund(
            context.env,
            reservation,
            Math.abs(deltaAmount),
            "admin_early_departure",
            { previousTotal, nextTotal },
          );

          if (refund.fullyRefunded) {
            reservationStatus = "modified";
          } else {
            reservationStatus = refund.mode === "automatic" ? "modified" : "pending_refund";
          }

          if (reservationStatus !== "modified") {
            await updateReservationAndCalendarStatus(
              context.env,
              reservationId,
              reservationStatus,
              "confirmed",
            );
          }
        }
      } else {
        // Sans remboursement : le client garde le total d'origine (standard
        // Booking.com pour un tarif non remboursable). Seules les dates (et le
        // bloc calendrier) changent — les nuits restantes sont libérées.
        let existingSnapshot = [];
        try {
          const parsedSnapshot = JSON.parse(reservation.base_rate_snapshot || "[]");
          if (Array.isArray(parsedSnapshot)) {
            existingSnapshot = parsedSnapshot;
          }
        } catch {
          // existingSnapshot reste [] : snapshot informatif uniquement.
        }

        await updateReservationBookingDetails(context.env, reservationId, {
          ...sharedUpdates,
          baseRateSnapshot: existingSnapshot,
          baseAmount: reservation.base_amount,
          touristTaxAmount: reservation.tourist_tax_amount,
          optionsAmount: reservation.options_amount,
          guestSurchargeAmount: reservation.guest_surcharge_amount,
          longStayDiscountAmount: reservation.long_stay_discount_amount,
          nonRefundableDiscountAmount: reservation.non_refundable_discount_amount,
          weeklyStayDiscountAmount: reservation.weekly_stay_discount_amount || 0,
          paymentFeeAmount: reservation.payment_fee_amount,
          totalAmount: previousTotal,
          status: reservation.status,
        });
      }

      try {
        await syncReservationToGoogleCalendar(context.env, reservationId);
      } catch (error) {
        // Les erreurs de sync calendrier ne doivent pas bloquer l'action admin.
        console.error("Early departure Google Calendar sync failed:", error);
      }

      if (sendEmail) {
        try {
          await sendReservationEmail(context.env, reservationId, "booking_modification", {
            deltaAmount: refundUnusedNights ? deltaAmount : 0,
          });
        } catch (error) {
          console.error("Early departure guest email failed:", error);
        }
      }

      await insertSyncLog(context.env, {
        unitId: reservation.unit_id || null,
        syncType: "early_departure",
        status: refund && !refund.fullyRefunded ? "warning" : "success",
        message:
          `Early departure recorded by admin for ${reservation.public_reference}: ` +
          `departure moved ${reservation.check_out_date} → ${payload.newCheckOutDate}` +
          (refund
            ? `, refund ${refund.mode} (${refund.amount} ${reservation.currency})`
            : ", no refund (guest keeps the original total)") +
          (sendEmail ? ", guest notified" : ", no guest email"),
        payloadSummary: {
          reservationId,
          previousCheckOutDate: reservation.check_out_date,
          newCheckOutDate: payload.newCheckOutDate,
          previousTotal,
          nextTotal: refundUnusedNights ? nextTotal : previousTotal,
          refundUnusedNights,
          sendEmail,
          refund,
        },
      });

      return jsonNoStore({
        ok: true,
        action,
        publicReference: reservation.public_reference,
        previousCheckOutDate: reservation.check_out_date,
        newCheckOutDate: payload.newCheckOutDate,
        previousTotal,
        nextTotal: refundUnusedNights ? nextTotal : previousTotal,
        deltaAmount,
        refundUnusedNights,
        sendEmail,
        reservationStatus,
        refund,
      });
    }

    if (action === "run_booking_sync") {
      return jsonNoStore(await runBookingIcsSync(context.env, payload.unitCode || null));
    }

    if (action === "run_arrival_emails") {
      return jsonNoStore(await runArrivalEmails(context.env, payload.targetDate || null));
    }

    if (action === "validate_calendar_sources") {
      return jsonNoStore(await validateCalendarSources(context.env, payload.unitCode || null));
    }

    if (action === "run_sensitive_data_retention") {
      return jsonNoStore(await runSensitiveDataRetention(context.env));
    }

    return badRequest("Unsupported admin action");
  } catch (error) {
    if (error instanceof SyntaxError) {
      return badRequest("Request body must be valid JSON");
    }

    console.error("Failed to handle admin action:", error);
    return serverError("Failed to handle admin action");
  }
}
