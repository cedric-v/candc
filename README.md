# C & C - Eco Studio & Parking

Official website: [candc.ch](https://candc.ch)

Multilingual website for C & C, featuring an Eco Studio and Parking in La Sonnaz, Fribourg.

## Supported Languages

- French (FR) - `/fr/`
- English (EN) - `/en/`
- German (DE) - `/de/`
- Spanish (ES) - `/es/`
- Portuguese (PT) - `/pt/`
- Italian (IT) - `/it/`

## Installation

```bash
npm install
```

## Development

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

- `src/` - Source files
  - `_data/` - Global data (translations.json)
  - `_includes/` - Nunjucks templates
  - `fr/`, `en/`, `de/`, `es/`, `pt/` - Pages by language
  - `assets/` - Images, CSS, JS

## Deployment
 
 The site is configured for CloudFlare Pages with automated builds and security headers.

## Analytics
 
 Audience analysis is managed via **CloudFlare Zaraz - Web tag management**. No GTM (Google Tag Manager) or GA (Google Analytics) tags should be inserted directly into the source code of this repository.

## License

This project is licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](./LICENSE).
