# Guide de déploiement - C & C

## Hébergement : Cloudflare Pages

Ce projet est conçu pour être hébergé sur **Cloudflare Pages**.

### Prérequis

- Node.js 18+ installé
- Compte Cloudflare configuré

### Installation locale

```bash
npm install
```

### Développement

```bash
npm start
```

Le site sera accessible sur `http://localhost:8080`

### Build de production

```bash
npm run build
```

Le site sera généré dans le dossier `_site/`

### Configuration Cloudflare Pages

1. Connecter le repository GitHub à Cloudflare Pages.
2. Utiliser les paramètres de build suivants :
   - **Framework preset**: Aucun (ou Eleventy s'il est listé)
   - **Build command**: `npm run build`
   - **Build output directory**: `_site`
   - **Node.js version**: 18 (définir la variable d'environnement `NODE_VERSION` à `18` si nécessaire)

### Gestion des Headers et Redirections

Cloudflare Pages supporte nativement les fichiers de configuration suivants, situés à la racine du dossier de sortie (`_site/`) :

- `_headers` : Définit les en-têtes HTTP (sécurité, cache, content-type).
- `_redirects` : Gère les redirections URL.

Ces fichiers sont copiés automatiquement depuis le dossier `src/` vers `_site/` lors du build (configuré dans `eleventy.config.js`).

> **Note** : Le fichier `_headers` est crucial pour forcer le Content-Type `application/xml` du sitemap.

## Tests

```bash
npm test
```

Les tests smoke vérifient :
- L'existence de toutes les pages (5 langues × 4 pages)
- La présence des CTA (Booking.com, Airbnb, WhatsApp, Email)
- Le sitemap.xml avec hreflang
- Le robots.txt

## Logo

Le logo doit être ajouté dans `src/assets/img/logo-cc.jpg` (format recommandé: 200x200px, JPG ou WebP).

## Notes importantes

- Les pages Business/Corporate sont visibles uniquement d'octobre à février
- Les emails sont obfusqués via JavaScript pour éviter le spam
- Le sitemap.xml est généré automatiquement avec hreflang pour les 5 langues
