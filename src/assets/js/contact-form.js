/**
 * Formulaire de contact — client partagé (toutes langues).
 *
 * Les libellés et messages proviennent des attributs data-* rendus par les
 * templates contact.njk (une langue = un formulaire, zéro duplication JS).
 * Validation inline accessible (aria-describedby, aria-live), honeypot,
 * time-trap, Turnstile chargé paresseusement si une site key est présente.
 */
(function () {
  "use strict";

  var form = document.querySelector("[data-contact-form]");
  if (!form) return;

  var locale = form.getAttribute("data-locale") || "fr";
  var startedAt = String(Date.now());
  var submitBtn = form.querySelector("[data-contact-submit]");
  var submitLabel = form.querySelector("[data-contact-submit-label]");
  var statusEl = form.querySelector("[data-contact-status]");
  var turnstileBox = form.querySelector("[data-contact-turnstile]");
  var turnstileSiteKey = form.getAttribute("data-turnstile-sitekey") || "";
  var turnstileWidgetId = null;
  var turnstileReady = false;

  function msg(key) {
    return form.getAttribute("data-msg-" + key) || "";
  }

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = "form-status" + (kind ? " form-status--" + kind : "");
    statusEl.hidden = !text;
  }

  function fieldError(input, message) {
    var wrapper = input.closest(".form-field");
    if (!wrapper) return;
    var errorEl = wrapper.querySelector(".field-error");
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = !message;
    input.setAttribute("aria-invalid", message ? "true" : "false");
  }

  /* ---------- Turnstile (lazy, invisible si non configuré) ---------- */

  function loadTurnstile() {
    if (!turnstileSiteKey || turnstileBox.dataset.loaded) return Promise.resolve();
    turnstileBox.dataset.loaded = "1";

    return new Promise(function (resolve) {
      window.onContactTurnstileLoad = function () {
        try {
          turnstileWidgetId = window.turnstile.render(turnstileBox, {
            sitekey: turnstileSiteKey,
            action: "contact-form",
            appearance: "interaction-only",
          });
          turnstileReady = true;
        } catch (e) {
          // Widget indisponible : on laisse la requête partir, le serveur
          // décidera (il peut rejeter si TURNSTILE_SECRET_KEY est actif).
        }
        resolve();
      };
      var s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onContactTurnstileLoad&render=explicit";
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    });
  }

  function turnstileToken() {
    if (!turnstileReady || !window.turnstile || turnstileWidgetId === null) return "";
    try {
      return window.turnstile.getResponse(turnstileWidgetId) || "";
    } catch (e) {
      return "";
    }
  }

  /* ---------------- Validation inline ---------------- */

  /* Normalisation/validité d'un numéro de mobile (miroir de la logique
     serveur dans functions/api/contact.js) :
     - formats internationaux acceptés : +XX… ou 00XX…
     - format suisse sans indicatif : 079… (mobiles CH, préfixe 7[4-9])
     - tout autre numéro doit utiliser l'indicatif international.
     Retour : numéro E.164 («+41791234567») ou null si invalide. */
  function normalizeIntlMobile(raw) {
    var value = String(raw || "").trim();
    if (!value) return "";
    // Artefact courant «+41 (0)79 …»
    value = value.replace(/\(0\)/g, " ");
    var hasPlus = value.charAt(0) === "+";
    var digits = value.replace(/[^0-9]/g, "");
    var intl;
    if (hasPlus) {
      intl = digits;
    } else if (digits.indexOf("00") === 0 && digits.length > 8) {
      intl = digits.slice(2);
    } else if (digits.indexOf("0") === 0) {
      // Supposition Suisse uniquement pour les préfixes mobiles connus
      intl = /^07[4-9]/.test(digits) ? "41" + digits.slice(1) : null;
    } else {
      return null;
    }
    if (!intl || !/^[0-9]{8,15}$/.test(intl)) return null;
    return "+" + intl;
  }

  function validateField(input) {
    var value = (input.value || "").trim();
    if (input.hasAttribute("required") && !value) {
      fieldError(input, msg("err-required"));
      return false;
    }
    if (
      input.type === "email" &&
      value &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ) {
      fieldError(input, msg("err-email"));
      return false;
    }
    if (input.name === "phone" && value) {
      var normalized = normalizeIntlMobile(value);
      if (normalized === null) {
        fieldError(input, msg("err-phone"));
        return false;
      }
    }
    fieldError(input, "");
    return true;
  }

  form.querySelectorAll(
    "input[required], textarea[required], input[type='email'], input[name='phone']"
  ).forEach(function (input) {
    input.addEventListener("blur", function () {
      validateField(input);
    });
    input.addEventListener("input", function () {
      if (input.getAttribute("aria-invalid") === "true") validateField(input);
    });
  });

  /* --------------------------- Soumission --------------------------- */

  function setBusy(busy) {
    if (!submitBtn) return;
    submitBtn.disabled = busy;
    submitBtn.classList.toggle("is-busy", busy);
    if (submitLabel) {
      if (busy && msg("sending")) {
        submitBtn.dataset.defaultLabel = submitLabel.textContent;
        submitLabel.textContent = msg("sending");
      } else if (!busy && submitBtn.dataset.defaultLabel) {
        submitLabel.textContent = submitBtn.dataset.defaultLabel;
      }
    }
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    var valid = true;
    form.querySelectorAll("input[required], textarea[required]").forEach(function (input) {
      if (!validateField(input)) valid = false;
    });
    var emailInput = form.querySelector("input[type='email']");
    if (emailInput && valid && emailInput.value.trim() && !validateField(emailInput)) valid = false;
    var phoneInput = form.elements.phone;
    if (phoneInput && valid && phoneInput.value.trim() && !validateField(phoneInput)) valid = false;
    if (!valid) {
      var firstInvalid = form.querySelector("[aria-invalid='true']");
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    setBusy(true);
    setStatus("", "");

    try {
      await loadTurnstile();

      var payload = {
        name: form.elements.name.value,
        email: form.elements.email.value,
        phone: form.elements.phone.value,
        topic: form.elements.topic.value,
        message: form.elements.message.value,
        website: form.elements.website ? form.elements.website.value : "",
        startedAt: startedAt,
        locale: locale,
        turnstileToken: turnstileToken(),
      };

      var response = await fetch("/api/contact/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      var result = await response.json().catch(function () { return {}; });

      if (response.ok && result.success) {
        form.reset();
        if (turnstileReady && window.turnstile && turnstileWidgetId !== null) {
          try { window.turnstile.reset(turnstileWidgetId); } catch (e) {}
        }
        setStatus(msg("success"), "success");
      } else if (result.error === "invalid_phone" && phoneInput) {
        fieldError(phoneInput, msg("err-phone"));
        phoneInput.focus();
      } else {
        setStatus(msg("error"), "error");
      }
    } catch (e) {
      setStatus(msg("error"), "error");
    } finally {
      setBusy(false);
    }
  });

  if (statusEl) statusEl.hidden = true;
})();
