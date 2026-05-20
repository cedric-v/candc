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

### Binding D1 obligatoire sur Cloudflare Pages

Important :

- le code attend un binding D1 nomme exactement `DB`
- sans ce binding, l'API renvoie une erreur du type `Missing D1 binding: DB`
- apres ajout du binding, il faut redeployer le projet Pages

Etapes dans l'interface Cloudflare Pages :

1. ouvrir `Workers & Pages`
2. selectionner le projet `candc.ch`
3. aller dans `Settings` -> `Bindings`
4. cliquer `Add` -> `D1 database`
5. mettre `DB` comme `Variable name`
6. selectionner la base D1 de reservation
7. enregistrer
8. redeployer le projet

Si tu utilises les environnements `Production` et `Preview`, verifie le binding dans les deux environnements si necessaire.

Sources :

- [Cloudflare Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/)
- [Cloudflare Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)

## Variables et secrets a configurer

Variables non secretes possibles :

- `PUBLIC_BASE_URL`
- `DEFAULT_BOOKING_UNIT_CODE`
- `TOURIST_TAX_ADULT_CHF`
- `WC_SHOWER_CLEANING_FEE_CHF`
- `PAYMENT_FEE_RATE`
- `PAYMENT_FEE_FIXED_CHF`
- `TIMEZONE`
- `DEFAULT_CHECK_IN_TIME`
- `DEFAULT_CHECK_IN_END_TIME`
- `DEFAULT_CHECK_OUT_TIME`
- `BOOKING_ICS_IMPORT_URL`
- `ADMIN_NOTIFICATION_EMAIL`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO`

Secrets ou valeurs sensibles :

- `SUMUP_API_KEY`
- `SUMUP_MERCHANT_CODE`
- `INTERNAL_SYNC_TOKEN`
- `ADMIN_ACCESS_TOKEN`
- `RESEND_API_KEY`
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
- l'import est idealement stocke en base dans `external_calendar_sources.import_url`
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
- stocker le calendrier cible par unite dans `rentable_units.google_calendar_id`
- partager le calendrier cible avec l'adresse e-mail du service account
- donner le droit de modifier les evenements

### Resend

- utilise pour les e-mails transactionnels
- requis si vous voulez :
  - l'e-mail instantane de reservation
  - les e-mails de modification / annulation
  - le rappel automatique d'arrivee

Variables :

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO`

### Admin

- la mini interface est accessible sur `/admin/booking`
- un token explicite est attendu via `ADMIN_ACCESS_TOKEN`

### Jobs internes

- `POST /api/internal/jobs/run` peut lancer :
  - le sync Booking.com ICS
  - les e-mails d'arrivee
  - les deux en une seule execution

Important :

- le backend des jobs est pret
- le declenchement automatique reste a brancher selon le mode exact de deploiement Cloudflare
- je n'ai pas pu deplacer ou creer ces triggers automatiquement depuis ici

## Notes importantes

- le systeme est deja concu pour supporter ensuite le studio dans le meme moteur
- la reservation parking est la premiere UX exposee
- les emails transactionnels et l'admin restent a terminer
