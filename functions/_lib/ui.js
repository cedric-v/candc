export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function htmlDocument({ title, body, lang = "fr" }) {
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f0e8;
        --panel: rgba(255, 255, 255, 0.82);
        --text: #1f2a22;
        --muted: #5a675d;
        --accent: #24543b;
        --accent-soft: #dce9df;
        --border: rgba(36, 84, 59, 0.15);
        --danger: #a1352a;
        --warning: #7b5c14;
        --success: #1e6a47;
        --shadow: 0 24px 60px rgba(24, 39, 30, 0.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(244, 198, 128, 0.35), transparent 40%),
          linear-gradient(180deg, #f6f2ea 0%, #eef3ed 100%);
      }
      a { color: var(--accent); }
      .shell {
        max-width: 980px;
        margin: 0 auto;
        padding: 32px 18px 64px;
      }
      .hero {
        margin-bottom: 24px;
      }
      .hero h1 {
        margin: 0 0 8px;
        font-size: clamp(2rem, 4vw, 3.2rem);
        line-height: 1.02;
      }
      .hero p {
        margin: 0;
        color: var(--muted);
        max-width: 54rem;
      }
      .grid {
        display: grid;
        gap: 18px;
      }
      @media (min-width: 900px) {
        .grid.cols-2 {
          grid-template-columns: 1.1fr 0.9fr;
        }
      }
      .card {
        background: var(--panel);
        backdrop-filter: blur(8px);
        border: 1px solid var(--border);
        border-radius: 24px;
        padding: 22px;
        box-shadow: var(--shadow);
      }
      .card h2, .card h3 {
        margin-top: 0;
      }
      .stack {
        display: grid;
        gap: 14px;
      }
      .meta {
        display: grid;
        gap: 10px;
      }
      .meta-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--border);
      }
      .meta-row:last-child { border-bottom: 0; padding-bottom: 0; }
      .label { color: var(--muted); font-size: 0.94rem; }
      .value { font-weight: 600; }
      form {
        display: grid;
        gap: 14px;
      }
      .field {
        display: grid;
        gap: 6px;
      }
      .field-row {
        display: grid;
        gap: 14px;
      }
      @media (min-width: 720px) {
        .field-row.two {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .field-row.three {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .field-row.four {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }
      label {
        font-weight: 600;
        font-size: 0.95rem;
      }
      input, select, textarea, button {
        font: inherit;
      }
      input, select, textarea {
        width: 100%;
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid rgba(36, 84, 59, 0.22);
        background: rgba(255, 255, 255, 0.85);
      }
      textarea { min-height: 110px; resize: vertical; }
      .checkbox {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .checkbox input {
        width: auto;
        margin: 0;
      }
      button {
        border: 0;
        border-radius: 999px;
        padding: 12px 18px;
        font-weight: 700;
        cursor: pointer;
      }
      .btn-primary {
        background: var(--accent);
        color: #fff;
      }
      .btn-secondary {
        background: #eef4ef;
        color: var(--accent);
      }
      .btn-danger {
        background: #f8e5e2;
        color: var(--danger);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .notice {
        border-radius: 18px;
        padding: 14px 16px;
        font-size: 0.95rem;
      }
      .notice.info { background: #edf4ef; color: var(--accent); }
      .notice.warn { background: #fbf0d5; color: var(--warning); }
      .notice.error { background: #f9e2e0; color: var(--danger); }
      .notice.success { background: #ddeee5; color: var(--success); }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.95rem;
      }
      th, td {
        padding: 10px 8px;
        border-bottom: 1px solid var(--border);
        text-align: left;
        vertical-align: top;
      }
      th { color: var(--muted); font-weight: 700; }
      .pill {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.82rem;
        font-weight: 700;
      }
      .small { font-size: 0.9rem; color: var(--muted); }
      .mono { font-family: "SFMono-Regular", "Menlo", monospace; }
    </style>
  </head>
  <body>
    <main class="shell">
      ${body}
    </main>
  </body>
</html>`;
}
