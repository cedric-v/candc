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
