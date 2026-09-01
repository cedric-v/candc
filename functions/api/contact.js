/**
 * Endpoint public du formulaire de contact (POST /api/contact).
 *
 * Envoi via Resend (RESEND_API_KEY + EMAIL_FROM, mêmes secrets que les
 * e-mails transactionnels) vers l'admin (ADMIN_NOTIFICATION_EMAIL,
 * par défaut bonjour@candc.ch), avec reply_to sur l'expéditeur.
 *
 * Protections anti-spam :
 *  - honeypot « website » (silencieux)
 *  - time-trap : soumission < 1,5 s après le chargement refusée
 *  - rate limit IP/e-mail via KV (optionnel, si CONTACT_KV est bindé)
 *  - Cloudflare Turnstile : activé automatiquement dès que
 *    TURNSTILE_SECRET_KEY est défini (le site key est injecté au build
 *    via TURNSTILE_SITE_KEY — voir .env.example). Sans secret côté
 *    fonction, la vérification est simplement sautée.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TURNSTILE_VERIFY_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function json(payload, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
	});
}

function sameOrigin(request) {
	const origin = request.headers.get("Origin");
	if (!origin) return true;
	try {
		return new URL(origin).origin === new URL(request.url).origin;
	} catch {
		return false;
	}
}

function escapeHtml(value) {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function isEmailLike(value) {
	return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Normalise un numéro de mobile optionnel au format international (E.164).
 *
 * Formats acceptés :
 *  - international   : «+41 79 123 45 67», «0041791234567»
 *  - suisse national : «079 123 45 67» -> +41791234567 (préfixes mobiles CH 7[4-9])
 * Tout autre format (national hors Suisse, numéro incomplet) est refusé :
 * l'expéditeur doit alors fournir l'indicatif international.
 *
 * Retourne une chaîne normalisée («+41791234567»), "" si champ vide,
 * ou null si le format est invalide.
 */
export function normalizeIntlMobile(raw) {
	let value = String(raw ?? "").trim();
	if (!value) return "";
	// Artefact courant «+41 (0)79 …»
	value = value.replace(/\(0\)/g, " ");
	const hasPlus = value.startsWith("+");
	const digits = value.replace(/[^0-9]/g, "");
	let intl;
	if (hasPlus) {
		intl = digits;
	} else if (digits.length > 8 && digits.startsWith("00")) {
		intl = digits.slice(2);
	} else if (digits.startsWith("0")) {
		// Supposition Suisse uniquement pour les préfixes mobiles connus
		intl = /^07[4-9]/.test(digits) ? `41${digits.slice(1)}` : null;
	} else {
		return null;
	}
	if (!intl || !/^[0-9]{8,15}$/.test(intl)) return null;
	return `+${intl}`;
}

// Fail-open : si le KV est indisponible (quota, incident), on laisse passer
// plutôt que de bloquer le formulaire — Turnstile reste la barrière principale.
async function rateLimited(context, email) {
	const kv = context.env.CONTACT_KV;
	if (!kv) return false;
	const ip = context.request.headers.get("CF-Connecting-IP") || "unknown";
// Namespace KV partagé avec le projet cedric-v (voir DEPLOYMENT.md) : les clés
// sont préfixées « candc:contact: » pour isoler les compteurs de rate limit de
// ceux du site cedricv.com (préfixe « cedricv:contact: »).
	const keys = [`candc:contact:ip:${ip}`, `candc:contact:email:${email}`];
	try {
		for (const key of keys) {
			if (await kv.get(key)) return true;
		}
		await Promise.all(keys.map((key) => kv.put(key, "1", { expirationTtl: 3600 })));
	} catch (error) {
		console.error("[contact] rate limit KV unavailable, fail-open:", error?.message || error);
		return false;
	}
	return false;
}

async function turnstileValid(request, token, env) {
	if (!token) return false;
	let result;
	try {
		result = await fetch(TURNSTILE_VERIFY_ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				secret: env.TURNSTILE_SECRET_KEY,
				response: token,
				remoteip: request.headers.get("CF-Connecting-IP") || undefined,
			}),
		}).then((response) => response.json());
	} catch {
		return false;
	}
	const expectedHostname = new URL(request.url).hostname.toLowerCase();
	return (
		result.success === true &&
		result.action === "contact-form" &&
		(!result.hostname || result.hostname.toLowerCase() === expectedHostname)
	);
}

// Sujets autorisés (générés par le <select> du formulaire de contact).
const TOPICS = new Set(["booking", "studio", "parking", "monthly", "other"]);

export async function onRequestPost(context) {
	const { request, env } = context;
	if (!sameOrigin(request)) {
		return json({ success: false, error: "origin_not_allowed" }, 403);
	}

	let data;
	try {
		data = await request.json();
	} catch {
		return json({ success: false, error: "invalid_request" }, 400);
	}

	// Honeypot : réponse positive silencieuse pour ne rien révéler aux robots.
	if (String(data.website || "").trim()) {
		return json({ success: true });
	}

	const name = String(data.name || "").trim().slice(0, 120);
	const email = String(data.email || "").trim().toLowerCase();
	const phoneInput = String(data.phone || "").trim().slice(0, 30);
	const phone = normalizeIntlMobile(phoneInput);
	if (phone === null) {
		return json({ success: false, error: "invalid_phone" }, 400);
	}
	const topic = String(data.topic || "").trim().slice(0, 40);
	const message = String(data.message || "").trim().slice(0, 5000);
	const locale = ["fr", "en", "de", "es", "pt", "it", "nl"].includes(data.locale) ? data.locale : "fr";

	if (!name || !isEmailLike(email) || !message || !TOPICS.has(topic)) {
		return json({ success: false, error: "invalid_request" }, 400);
	}

	// Time-trap anti-bot minimal (rendu JS obligatoire de toute façon).
	if (Number(data.startedAt) && Date.now() - Number(data.startedAt) < 1500) {
		return json({ success: false, error: "invalid_request" }, 400);
	}

	try {
		// Vérification Turnstile d'abord (quand le secret est configuré) : les
		// bots sont rejetés avant de consommer des écritures KV, ce qui préserve
		// le quota du plan gratuit pour les vrais visiteurs.
		if (env.TURNSTILE_SECRET_KEY && !(await turnstileValid(request, data.turnstileToken, env))) {
			return json({ success: false, error: "bot_check_failed" }, 400);
		}

		if (await rateLimited(context, email)) {
			return json({ success: false, error: "rate_limited" }, 429);
		}

		await sendContactNotification(env, { name, email, phone, topic, message, locale });
		// L'accusé de réception ne doit jamais faire perdre la demande :
		// en cas d'échec, seule la notification admin compte déjà envoyée.
		try {
			await sendAcknowledgement(env, { name, email, locale });
		} catch (error) {
			console.error("[contact] acknowledgement failed:", error?.message || error);
		}

		return json({ success: true });
	} catch (error) {
		console.error("[contact]", error?.message || error);
		const configurationMissing =
			error instanceof Error && /configuration_missing/.test(error.message);
		return json(
			{ success: false, error: configurationMissing ? "configuration_missing" : "server_error" },
			configurationMissing ? 503 : 500,
		);
	}
}

export async function onRequest(context) {
	if (context.request.method !== "POST") {
		return json({ success: false, error: "method_not_allowed" }, 405);
	}
	return onRequestPost(context);
}

/* ------------------------------------------------------------------ */
/* E-mails (Resend)                                                    */
/* ------------------------------------------------------------------ */

const TOPIC_LABELS = {
	fr: { booking: "Question sur une réservation", studio: "Studio éco meublé", parking: "Place de stationnement", monthly: "Location au mois (professionnels)", other: "Autre demande" },
	en: { booking: "Booking question", studio: "Eco studio", parking: "Parking space", monthly: "Monthly rental (business)", other: "Other request" },
	de: { booking: "Frage zu einer Reservierung", studio: "Öko-Studio", parking: "Stellplatz", monthly: "Monatsmiete (Geschäftskunden)", other: "Andere Anfrage" },
	es: { booking: "Consulta sobre una reserva", studio: "Estudio ecológico", parking: "Plaza de aparcamiento", monthly: "Alquiler mensual (profesionales)", other: "Otra consulta" },
	pt: { booking: "Questão sobre uma reserva", studio: "Estúdio ecológico", parking: "Lugar de estacionamento", monthly: "Arrendamento mensal (empresas)", other: "Outro pedido" },
	it: { booking: "Domanda su una prenotazione", studio: "Studio ecologico", parking: "Posto auto", monthly: "Affitto mensile (aziende)", other: "Altra richiesta" },
	nl: { booking: "Vraag over een reservering", studio: "Ecostudio", parking: "Parkeerplaats", monthly: "Maandhuur (zakelijk)", other: "Andere vraag" },
};

function topicLabel(topic, locale) {
	const labels = TOPIC_LABELS[locale] || TOPIC_LABELS.fr;
	return labels[topic] || TOPIC_LABELS.fr.other;
}

async function sendResend(env, body) {
	const apiKey = env.RESEND_API_KEY;
	const from = env.EMAIL_FROM;
	if (!apiKey || !from) throw new Error("email_configuration_missing");

	const response = await fetch(RESEND_ENDPOINT, {
		method: "POST",
		headers: {
			authorization: `Bearer ${apiKey}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ from, ...body }),
	});

	if (!response.ok) {
		throw new Error(`resend_send_failed:${response.status}`);
	}
	return response.json();
}

async function sendContactNotification(env, { name, email, phone, topic, message, locale }) {
	const to = env.ADMIN_NOTIFICATION_EMAIL || "bonjour@candc.ch";const subjectByLocale = {
		fr: `Nouveau message de contact — ${name}`,
		en: `New contact message — ${name}`,
		de: `Neue Kontaktanfrage — ${name}`,
		es: `Nuevo mensaje de contacto — ${name}`,
		pt: `Nova mensagem de contato — ${name}`,
		it: `Nuovo messaggio di contatto — ${name}`,
		nl: `Nieuw contactbericht — ${name}`,
	};
	const subject = subjectByLocale[locale] || subjectByLocale.fr;

	const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
<h2>${escapeHtml(subject)}</h2>
<p>
<strong>${escapeHtml(locale === "en" ? "Name" : "Nom")} :</strong> ${escapeHtml(name)}<br>
<strong>Email :</strong> ${escapeHtml(email)}<br>
<strong>${escapeHtml(locale === "en" ? "Phone" : "Téléphone")} :</strong> ${phone ? escapeHtml(phone) : "—"}<br>
<strong>${escapeHtml(locale === "en" ? "Topic" : "Objet")} :</strong> ${escapeHtml(topicLabel(topic, locale))}
</p>
<hr>
<p style="white-space:pre-wrap">${escapeHtml(message)}</p>
<p style="color:#64748b;font-size:0.85em">Langue du visiteur : ${escapeHtml(locale)}</p>
</body></html>`;

	const text = `${subject}\n\nNom : ${name}\nEmail : ${email}\nTéléphone : ${phone || "—"}\nObjet : ${topicLabel(topic, locale)}\nLangue : ${locale}\n\n${message}`;

	return sendResend(env, {
		to: [to],
		subject,
		html,
		text,
		reply_to: email,
	});
}

async function sendAcknowledgement(env, { name, email, locale }) {
	const acks = {
		fr: {
			subject: "Nous avons bien reçu votre message",
			greeting: `Bonjour ${name},`,
			body: "Merci pour votre message. Nous l'avons bien reçu et vous répondrons très vite, généralement sous 24 h.\n\nCéline & Cédric — C&C",
		},
		en: {
			subject: "We have received your message",
			greeting: `Hello ${name},`,
			body: "Thank you for your message. We have received it and will get back to you shortly, usually within 24 hours.\n\nCéline & Cédric — C&C",
		},
		de: {
			subject: "Wir haben Ihre Nachricht erhalten",
			greeting: `Hallo ${name},`,
			body: "Vielen Dank für Ihre Nachricht. Wir haben sie erhalten und melden uns baldmöglichst, in der Regel innerhalb von 24 Stunden.\n\nCéline & Cédric — C&C",
		},
		es: {
			subject: "Hemos recibido tu mensaje",
			greeting: `Hola ${name}:`,
			body: "Gracias por tu mensaje. Lo hemos recibido y te contestaremos muy pronto, normalmente en menos de 24 horas.\n\nCéline & Cédric — C&C",
		},
		pt: {
			subject: "Recebemos a sua mensagem",
			greeting: `Olá ${name},`,
			body: "Obrigado pela sua mensagem. Recebemo-la e responderemos em breve, normalmente em menos de 24 horas.\n\nCéline & Cédric — C&C",
		},
		it: {
			subject: "Abbiamo ricevuto il tuo messaggio",
			greeting: `Ciao ${name},`,
			body: "Grazie per il tuo messaggio. Lo abbiamo ricevuto e ti risponderemo al più presto, di solito entro 24 ore.\n\nCéline & Cédric — C&C",
		},
		nl: {
			subject: "Wij hebben uw bericht ontvangen",
			greeting: `Hallo ${name},`,
			body: "Bedankt voor uw bericht. Wij hebben het ontvangen en nemen zo snel mogelijk contact met u op, meestal binnen 24 uur.\n\nCéline & Cédric — C&C",
		},
	};
	const ack = acks[locale] || acks.fr;

	return sendResend(env, {
		to: [email],
		subject: ack.subject,
		html: `<!doctype html><html lang="${escapeHtml(locale)}"><body style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a"><p>${escapeHtml(ack.greeting)}</p><p style="white-space:pre-wrap">${escapeHtml(ack.body)}</p></body></html>`,
		text: `${ack.greeting}\n\n${ack.body}`,
		reply_to: env.ADMIN_NOTIFICATION_EMAIL || "bonjour@candc.ch",
	});
}
