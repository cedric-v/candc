import { html } from "../_lib/http.js";
import { getReservationByPublicReference } from "../_lib/db.js";
import { htmlDocument, escapeHtml } from "../_lib/ui.js";
import { getManageText, localeFromAcceptLanguage } from "../_lib/manage-i18n.js";

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
  const manageToken = url.searchParams.get("manageToken") || "";
  const reservation = reference
    ? await getReservationByPublicReference(context.env, reference)
    : null;

  // Use the reservation's booking locale; fall back to the visitor's
  // Accept-Language header when no reservation was matched yet.
  const locale = reservation?.locale || localeFromAcceptLanguage(context.request.headers.get("accept-language"));
  const t = getManageText(locale);
  const c = t.confirm;

  const copy = getConfirmationCopy(reservation, t);
  const manageLink = manageToken ? `/booking/manage/${encodeURIComponent(manageToken)}` : "";
  const bookingBackLink = reservation?.unit_type === "studio"
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
