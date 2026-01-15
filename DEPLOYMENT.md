# Guide de déploiement - C & C

## Prérequis

- Node.js 18+ installé
- Compte Netlify configuré

## Installation locale

```bash
npm install
```

## Développement

```bash
npm start
```

Le site sera accessible sur `http://localhost:8080`

## Build de production

```bash
npm run build
```

Le site sera généré dans le dossier `_site/`

## Tests

```bash
npm test
```

Les tests smoke vérifient :
- L'existence de toutes les pages (5 langues × 4 pages)
- La présence des CTA (Booking.com, Airbnb, WhatsApp, Email)
- Le sitemap.xml avec hreflang
- Le robots.txt

## Déploiement sur Netlify

1. Connecter le repository GitHub `cedric-v/candc` à Netlify
2. Configurer les variables d'environnement si nécessaire
3. Le build se fera automatiquement via `netlify.toml`

### Configuration Netlify

- **Build command**: `npm run build`
- **Publish directory**: `_site`
- **Node version**: 18.x

### Netlify Forms

Les formulaires sont configurés avec `data-netlify="true"` et seront automatiquement traités par Netlify. Les soumissions seront envoyées à `bonjour@candc.ch`.

## Logo

Le logo doit être ajouté dans `src/assets/img/logo-cc.jpg` (format recommandé: 200x200px, JPG ou WebP).

## Notes importantes

- Les pages Business/Corporate sont visibles uniquement d'octobre à février
- Les emails sont obfusqués via JavaScript pour éviter le spam
- Le sitemap.xml est généré automatiquement avec hreflang pour les 5 langues
- Les headers de sécurité sont configurés dans `netlify.toml`
