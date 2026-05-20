# Guide de deploiement - C & C

## Vue d'ensemble

Le projet combine :

- un site statique `Eleventy`
- des `Cloudflare Pages Functions`
- une base `Cloudflare D1`

Le build public continue de sortir dans `_site/`, mais le systeme de reservation depend aussi de bindings et de secrets Cloudflare.

## Prerequis

- Node.js 18+
- compte Cloudflare
- projet Cloudflare Pages
- base `D1`
- credentials externes si vous activez les integrations :
  - SumUp
  - Google Calendar

## Installation locale

```bash
npm install
```

## Developpement local

```bash
npm start
```

Le site est accessible sur `http://localhost:8080`.

## Build de production

```bash
npm run build
```

Le site genere est ecrit dans `_site/`.

## Tests

```bash
npm test
```

Les smoke tests valident :

- les pages marketing principales
- les pages de reservation parking
- le sitemap hreflang
- `robots.txt`

## Configuration Cloudflare Pages

Parametres recommandes :

- Framework preset : `None` ou `Eleventy`
- Build command : `npm run build`
- Build output directory : `_site`
- Node.js version : `18+`

## Configuration booking backend

Copier d'abord :

```bash
cp wrangler.toml.example wrangler.toml
```

Puis :

1. creer ou lier la base D1
2. remplacer `database_id`
3. executer la migration SQL
4. configurer les variables d'environnement et secrets Cloudflare

Exemple :

```bash
wrangler d1 create candc-booking
wrangler d1 execute candc-booking --file=./migrations/0001_booking_schema.sql
```

## Variables et secrets a configurer

Variables non secretes possibles :

- `PUBLIC_BASE_URL`
- `DEFAULT_BOOKING_UNIT_CODE`
- `DEFAULT_BASE_RATE_CHF`
- `TOURIST_TAX_ADULT_CHF`
- `WC_SHOWER_CLEANING_FEE_CHF`
- `PAYMENT_FEE_RATE`
- `PAYMENT_FEE_FIXED_CHF`
- `TIMEZONE`
- `DEFAULT_CHECK_IN_TIME`
- `DEFAULT_CHECK_IN_END_TIME`
- `DEFAULT_CHECK_OUT_TIME`
- `BOOKING_ICS_IMPORT_URL`
- `GOOGLE_CALENDAR_ID`

Secrets ou valeurs sensibles :

- `SUMUP_API_KEY`
- `SUMUP_MERCHANT_CODE`
- `INTERNAL_SYNC_TOKEN`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

Valeurs actuelles recommandees pour le parking :

- `PAYMENT_FEE_RATE=0.025`
- `PAYMENT_FEE_FIXED_CHF=0`

Raison :

- SumUp facture 1.5 % sur les cartes de debit et 2.5 % sur les cartes de credit
- tant qu'on ne distingue pas de facon fiable le type de carte avant paiement, le projet applique `2.5 %` a tous les paiements

## Fichiers de configuration statiques

Cloudflare Pages prend toujours en charge :

- `_headers`
- `_redirects`

Ces fichiers sont copies depuis `src/` vers `_site/`.

## Integrations externes

### Booking.com ICS

- chaque unite reservable peut avoir sa propre source ICS
- l'import peut etre stocke en base dans `external_calendar_sources.import_url`
- `BOOKING_ICS_IMPORT_URL` reste utile comme fallback pour l'unite par defaut

### SumUp

- checkout heberge
- webhook de confirmation de paiement
- credentials requis avant usage reel

Recuperation du `SUMUP_MERCHANT_CODE` :

```bash
curl https://api.sumup.com/v0.1/me \
  -H "Authorization: Bearer TON_SUMUP_API_KEY"
```

Puis lire :

- `merchant_profile.merchant_code`

Important :

- utiliser la cle privee issue de `Cles API`
- ne pas utiliser la `Cle API publique`

### Google Calendar

- utiliser un service account
- partager le calendrier cible avec l'adresse e-mail du service account
- donner le droit de modifier les evenements

## Notes importantes

- le systeme est deja concu pour supporter ensuite le studio dans le meme moteur
- la reservation parking est la premiere UX exposee
- les emails transactionnels et l'admin restent a terminer
