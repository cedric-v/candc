# C & C - Eco Studio & Parking

Site web multilingue pour C & C proposant un Eco Studio et un Parking à La Sonnaz, Fribourg.

## Langues supportées

- Français (FR) - `/fr/`
- Anglais (EN) - `/en/`
- Allemand (DE) - `/de/`
- Espagnol (ES) - `/es/`
- Portugais (PT) - `/pt/`

## Installation

```bash
npm install
```

## Développement

```bash
npm start
```

## Build

```bash
npm run build
```

## Tests

```bash
npm test
```

## Structure

- `src/` - Fichiers sources
  - `_data/` - Données globales (translations.json)
  - `_includes/` - Templates Nunjucks
  - `fr/`, `en/`, `de/`, `es/`, `pt/` - Pages par langue
  - `assets/` - Images, CSS, JS

## Déploiement
 
 Le site est configuré pour Netlify avec Netlify Forms et les headers de sécurité.

## Analytics
 
 L'analyse d'audience est gérée via **CloudFlare Zaraz - Web tag management**. Aucun tag GTM (Google Tag Manager) ou GA (Google Analytics) ne doit être inséré directement dans le code source de ce dépôt.
