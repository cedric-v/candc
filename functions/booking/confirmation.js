import { html } from "../_lib/http.js";
import { getReservationByPublicReference } from "../_lib/db.js";
import { htmlDocument, escapeHtml } from "../_lib/ui.js";

function getConfirmationCopy(reservation) {
  if (!reservation) {
    return {
      title: "Booking status",
      intro:
        "We could not match this payment return to a reservation yet. If payment has just succeeded, the status may update automatically within a few moments.",
      noticeTone: "info",
      noticeText: null,
    };
  }

  if (reservation.payment_status === "paid" && ["confirmed", "modified"].includes(reservation.status)) {
    return {
      title: "Payment confirmed",
      intro: "Your payment was successful and your reservation is confirmed.",
      noticeTone: "success",
      noticeText: "Your confirmation email includes your self-service management link.",
    };
  }

  return {
    title: "Payment still pending",
    intro:
      "Your reservation is still on hold and has not been confirmed yet. If you closed or cancelled the payment page, you can resume payment from your management link.",
    noticeTone: "warn",
    noticeText: "No charge was confirmed for this booking yet.",
  };
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const reference = url.searchParams.get("reference") || "";
  const manageToken = url.searchParams.get("manageToken") || "";
  const reservation = reference
    ? await getReservationByPublicReference(context.env, reference)
    : null;
  const copy = getConfirmationCopy(reservation);
  const manageLink = manageToken ? `/booking/manage/${encodeURIComponent(manageToken)}` : "";
  const body = `
    <section class="hero">
      <h1>${escapeHtml(copy.title)}</h1>
      <p>${escapeHtml(copy.intro)}</p>
    </section>
    <section class="card stack">
      <div class="notice ${escapeHtml(copy.noticeTone)}">Reference: <strong>${escapeHtml(reference || "pending")}</strong></div>
      ${copy.noticeText ? `<p>${escapeHtml(copy.noticeText)}</p>` : ""}
      <p>We will send your reservation email to the address used during booking. That email contains your self-service management link.</p>
      <p class="small">If you need help right away, you can still reach Cédric on WhatsApp: <a href="https://wa.me/41766738311">+41 76 673 83 11</a>.</p>
      <div class="actions">
        ${manageLink ? `<a class="btn-secondary" href="${escapeHtml(manageLink)}" style="text-decoration:none">Manage reservation</a>` : ""}
        <a class="btn-primary" href="/fr/parking/booking/" style="text-decoration:none">Back to booking page</a>
      </div>
    </section>
  `;

  return html(
    htmlDocument({
      title: "Booking confirmation",
      body,
      lang: "en",
    }),
  );
}
