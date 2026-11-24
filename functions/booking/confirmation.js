import { html } from "../_lib/http.js";
import { getReservationByPublicReference, getReservationForManageToken } from "../_lib/db.js";
import { htmlDocument, escapeHtml } from "../_lib/ui.js";
import { getManageText, localeFromAcceptLanguage } from "../_lib/manage-i18n.js";
import { getCookie, MANAGE_TOKEN_COOKIE } from "../_lib/cookies.js";
import { sha256Hex } from "../_lib/security.js";
import {
  reconcileSumupPayments,
  reservationMayAwaitSumupConfirmation,
} from "../_lib/payment-reconciliation.js";

// Le client revient de la page de paiement SumUp AVANT (ou sans) le webhook :
// sans cette relecture il lisait « paiement en attente » alors qu'il venait de
// payer (incident 24.11.2026). Le statut réel du checkout est relu chez SumUp,
// mais uniquement si le visiteur détient le cookie de gestion de CETTE
// réservation : une simple référence ne doit pas déclencher d'écriture.
async function reconcileForVisitor(env, reservation, manageToken) {
  if (!reservation || !manageToken || !reservationMayAwaitSumupConfirmation(reservation)) {
    return reservation;
  }

  try {
    const cookieReservation = await getReservationForManageToken(env, await sha256Hex(manageToken));

    if (!cookieReservation || cookieReservation.id !== reservation.id) {
      return reservation;
    }

    const reconciled = await reconcileSumupPayments(env, { reservationId: reservation.id });

    if (reconciled.confirmed > 0 || reconciled.conflicts.length > 0) {
      return (await getReservationByPublicReference(env, reservation.public_reference)) || reservation;
    }
  } catch (error) {
    console.error("Payment reconciliation on the confirmation page failed:", error);
  }

  return reservation;
}

function getConfirmationCopy(reservation, t) {
  if (!reservation) {
    return {
      title: t.confirm.titleMissing,
      intro: t.confirm.introMissing,
      noticeTone: "info",
      noticeText: null,
    };
  }

  if (reservation.payment_status === "paid" && ["confirmed", "modified"].includes(reservation.status)) {
    return {
      title: t.confirm.titlePaid,
      intro: t.confirm.introPaid,
      noticeTone: "success",
      noticeText: t.confirm.noticePaid,
    };
  }

  return {
    title: t.confirm.titlePending,
    intro: t.confirm.introPending,
    noticeTone: "warn",
    noticeText: t.confirm.noticePending,
  };
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const reference = url.searchParams.get("reference") || "";
  const manageToken =
    getCookie(context.request, MANAGE_TOKEN_COOKIE) || url.searchParams.get("manageToken") || "";
  const reservation = reference
    ? await getReservationByPublicReference(context.env, reference)
    : null;
  const resolvedReservation = await reconcileForVisitor(
    context.env,
    reservation,
    manageToken,
  );

  // Use the reservation's booking locale; fall back to the visitor's
  // Accept-Language header when no reservation was matched yet.
  const locale = resolvedReservation?.locale || localeFromAcceptLanguage(context.request.headers.get("accept-language"));
  const t = getManageText(locale);
  const c = t.confirm;

  const copy = getConfirmationCopy(resolvedReservation, t);
  const manageLink = manageToken ? `/booking/manage/${encodeURIComponent(manageToken)}` : "";
  const bookingBackLink = resolvedReservation?.unit_type === "studio"
    ? "/fr/eco-studio/booking/"
    : "/fr/parking/booking/";

  const body = `
    <section class="hero">
      <h1>${escapeHtml(copy.title)}</h1>
      <p>${escapeHtml(copy.intro)}</p>
    </section>
    <section class="card stack">
      <div class="notice ${escapeHtml(copy.noticeTone)}">${escapeHtml(c.referenceLabel)}<strong>${escapeHtml(reference || "pending")}</strong></div>
      ${copy.noticeText ? `<p>${escapeHtml(copy.noticeText)}</p>` : ""}
      <p>${escapeHtml(c.emailNotice)}</p>
      <p class="small">${escapeHtml(c.whatsapp)} <a href="https://wa.me/41766738311">+41 76 673 83 11</a>.</p>
      <div class="actions">
        ${manageLink ? `<a class="btn-secondary" href="${escapeHtml(manageLink)}" style="text-decoration:none">${escapeHtml(c.manage)}</a>` : ""}
        <a class="btn-primary" href="${escapeHtml(bookingBackLink)}" style="text-decoration:none">${escapeHtml(c.back)}</a>
      </div>
    </section>
  `;

  return html(
    htmlDocument({
      title: c.pageTitle,
      body,
      lang: locale,
    }),
  );
}
