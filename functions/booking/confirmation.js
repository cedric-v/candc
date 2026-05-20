import { html } from "../_lib/http.js";
import { htmlDocument, escapeHtml } from "../_lib/ui.js";

export function onRequestGet(context) {
  const url = new URL(context.request.url);
  const reference = url.searchParams.get("reference") || "";
  const body = `
    <section class="hero">
      <h1>Thank you</h1>
      <p>Your booking is being confirmed. If payment has just succeeded, the reservation status will be updated automatically within a few moments.</p>
    </section>
    <section class="card stack">
      <div class="notice success">Reference: <strong>${escapeHtml(reference || "pending")}</strong></div>
      <p>We will send your reservation email to the address used during booking. That email contains your self-service management link.</p>
      <p class="small">If you need help right away, you can still reach Cédric on WhatsApp: <a href="https://wa.me/41766738311">+41 76 673 83 11</a>.</p>
      <div class="actions">
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
