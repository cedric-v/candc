const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// Versioning d'assets par hash de contenu : chaque asset reçoit un hash
// dérivé de SON contenu (et non un timestamp global). Toute modification du
// fichier change l'URL servie (`?v=<hash>`), donc le navigateur recharge
// toujours la bonne version même avec `Cache-Control: immutable`.
//
// Utilisation dans les templates :
//   <script src="/assets/js/booking-flow.js?v={{ build.hash('/assets/js/booking-flow.js') }}" defer>
//
// Repli : si le fichier est introuvable, un timestamp de build est utilisé
// (le hash par contenu n'est pas un goulot d'étranglement au build).
const ASSET_DIR = path.join(__dirname, "..", "assets");

module.exports = () => {
  const buildTimestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");

  return {
    assetVersion: buildTimestamp,
    hash(relUrl) {
      try {
        const clean = String(relUrl || "").replace(/^\/assets\//, "");
        const filePath = path.join(ASSET_DIR, clean);
        const content = fs.readFileSync(filePath);
        return crypto.createHash("sha1").update(content).digest("hex").slice(0, 10);
      } catch {
        return buildTimestamp;
      }
    },
  };
};
