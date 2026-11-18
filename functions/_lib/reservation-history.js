/**
 * Timeline d'une réservation pour le panneau admin « History ».
 *
 * Trois sources, une seule liste triée :
 *   - `sync_logs` (événements métier : départ anticipé, modification client,
 *     annulation, relance de paiement, rotation de lien, renvoi d'e-mail…) ;
 *   - `email_logs` (e-mails envoyés + état de remise Resend) ;
 *   - `payments` (initial / ajustement / remboursement et leur statut SumUp).
 *
 * Le tri et la mise en forme sont faits ici (et non dans le script inline du
 * dashboard) pour rester testables : `scripts/booking-logic-tests.mjs`.
 *
 * Chaque entrée est du texte brut ; l'échappement HTML est la responsabilité de
 * l'appelant (`escapeHtml` dans `functions/admin/booking.js`).
 */

const KIND_ORDER = { payment: 0, history: 1, email: 2 };

function formatAmount(amount, currency) {
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    return currency ? String(currency) : "";
  }

  return `${value.toFixed(2)} ${currency || "CHF"}`.trim();
}

/**
 * Résumé lisible du avant/après stocké dans `sync_logs.payload_summary`.
 * Retourne une chaîne vide quand le payload n'apporte rien (l'appelant
 * retombe alors sur `message`).
 */
export function describeHistoryPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const parts = [];
  const dateMove = (label, before, after) => {
    if (before && after && before !== after) {
      parts.push(`${label} ${before} → ${after}`);
    }
  };

  dateMove("check-in", payload.previousCheckInDate, payload.newCheckInDate);
  dateMove("departure", payload.previousCheckOutDate, payload.newCheckOutDate);

  const previousTotal = Number(payload.previousTotal);
  const nextTotal = Number(payload.nextTotal);
  if (Number.isFinite(previousTotal) && Number.isFinite(nextTotal) && previousTotal !== nextTotal) {
    parts.push(`total ${previousTotal.toFixed(2)} → ${nextTotal.toFixed(2)} CHF`);
  }

  if (payload.refund && typeof payload.refund === "object" && Number.isFinite(Number(payload.refund.amount))) {
    const mode = payload.refund.mode ? `${payload.refund.mode} ` : "";
    parts.push(`refund ${mode}${formatAmount(payload.refund.amount)}`);
  }

  return parts.join(", ");
}

function emailDeliveryLabel(email) {
  const delivery = email.deliveryStatus || email.delivery_status || null;
  if (delivery) {
    return delivery === "bounced" ? "BOUNCED (not received)" : delivery;
  }

  return email.status === "sent" ? "pending" : email.status || null;
}

/**
 * @param {{ history?: object[], emails?: object[], payments?: object[] }} sources
 * @returns {{ when: string, kind: string, type: string, status: string|null, text: string }[]}
 *          Liste triée du plus récent au plus ancien.
 */
export function buildReservationTimeline({ history = [], emails = [], payments = [] } = {}) {
  const events = [];

  for (const log of history) {
    events.push({
      when: log.when || log.created_at || "",
      kind: "history",
      type: log.type || log.sync_type || "event",
      status: log.status || null,
      text: describeHistoryPayload(log.payload) || log.message || "",
    });
  }

  for (const email of emails) {
    events.push({
      when: email.when || email.created_at || "",
      kind: "email",
      type: `email: ${email.type || email.email_type || "email"}`,
      status: emailDeliveryLabel(email),
      text: email.recipient ? `to ${email.recipient}` : "",
    });
  }

  for (const payment of payments) {
    const providerReference = payment.provider_payment_reference || payment.providerPaymentReference || null;
    events.push({
      when: payment.when || payment.created_at || "",
      kind: "payment",
      type: `payment: ${payment.type || "payment"}`,
      status: payment.status || null,
      text: [
        formatAmount(payment.amount, payment.currency),
        payment.provider ? `via ${payment.provider}` : "",
        providerReference ? `ref ${providerReference}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  return events.sort((a, b) => {
    const byDate = String(b.when).localeCompare(String(a.when));
    if (byDate !== 0) {
      return byDate;
    }

    // Départage stable à la seconde : le paiement, puis l'événement, puis
    // l'e-mail (l'ordre chronologique fin d'un même instant).
    return (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
  });
}
