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

## Optimisation des images

Les images source dans `src/assets/img/` sont pre-optimisees (redimensionnees et recompressees) pour :

- reduire la charge du pipeline responsif eleventy-img
- eviter que le repli `<img>` non responsif (si sharp ne charge pas au build) ne serve des fichiers de plusieurs Mo

```bash
npm run optimize:images
```

Regles :

- `fond-hero-*.jpg` -> 2000px max, JPEG q82
- `about-background.jpg` -> 1920px max, JPEG q80
- `gallery/` et `testimonials/` -> 1200px max, JPEG q80
- PNG -> palette 256 couleurs, niveau 9 (alpha conserve)

Au build, eleventy-img genere pour chaque image un `<picture>` responsif AVIF -> WebP -> JPEG (largeurs 150/300/600/900/1200), avec attributs `width`/`height` et `loading` dedies.

Si un `<img>` tombe en repli (image source non optimisee servie), verifier :

1. version de Node (voir ci-dessous)
2. purge du cache de build Cloudflare Pages

## Tests

```bash
npm test
```

Les smoke tests valident :

- les pages marketing principales
- les pages de reservation parking et studio
- le sitemap hreflang
- `robots.txt`

## Configuration Cloudflare Pages

Parametres recommandes :

- Framework preset : `None` ou `Eleventy`
- Build command : `npm run build`
- Build output directory : `_site`
- Node.js version : `18.17+` (le fichier `.nvmrc` du projet epingle la version `22`)

### Version de Node.js et generation d'images

Le build responsive des images (`src/assets/img` -> WebP/JPEG haches) repose sur `sharp`, qui exige Node `^18.17 || ^20.3 || >=21`.

Attention :

- `@11ty/eleventy` v3 fonctionne avec n'importe quelle version `>=18`
- si le build Cloudflare Pages utilise une version de Node comprise entre `18.0` et `18.16`, le build reussit mais `sharp` ne charge pas
- dans ce cas chaque `<img>` tombe en repli et renvoie l'image source non optimisee

Pour eviter ce cas, le fichier `.nvmrc` du projet force Node `22`. Cloudflare Pages respecte `.nvmrc` (ou la variable d'environnement `NODE_VERSION`). Si le reglage est fait au dashboard, verifier `Settings` -> `Environment variables` -> `NODE_VERSION`.

### Cache de build

Cloudflare Pages met en cache `node_modules` entre les builds. Si un build precedent a installe les binaires natifs de `sharp` pour une autre plateforme ou une autre version de Node, le cache peut devenir invalide et `sharp` echoue silencieusement.

Si les images reviennent a des `<img>` simples (non optimises) apres un deploiement :

1. verifier que la version de Node respecte `.nvmrc` / `NODE_VERSION`
2. purger le cache de build puis relancer le build (bouton `Retry deployment` avec l'option de vider le cache dans le dashboard)

Note : meme si `sharp` echoue, le site reste fonctionnel : le repli utilise des chemins absolus (`/assets/img/...`), donc les images source s'affichent quand meme.

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

Si la base existe deja et doit recevoir la fusion des anciennes remises `7+ nuits` dans les paliers `Long-stay discount`, executer aussi :

```bash
wrangler d1 execute candc-booking --file=./migrations/0008_merge_weekly_discount_into_long_stay_tiers.sql
```

Si la base existe deja et doit ensuite relever cette remise `7+ nuits` de `5 %` a `10 %`, executer aussi :

```bash
wrangler d1 execute candc-booking --file=./migrations/0009_raise_7_night_long_stay_discount.sql
```

Si la base existe deja et doit maintenant mettre a jour l'URL iCal Booking.com du parking, executer aussi :

```bash
wrangler d1 execute candc-booking --file=./migrations/0011_update_parking_booking_ical_url.sql
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

- `PUBLIC_BASE_URL` — requis, base de l'URL publique du site
- `DEFAULT_BOOKING_UNIT_CODE` — code d'unite par defaut (`parking-space`)
- `TOURIST_TAX_ADULT_CHF`
- `WC_SHOWER_CLEANING_FEE_CHF`
- `PAYMENT_FEE_RATE`
- `PAYMENT_FEE_FIXED_CHF`
- `TIMEZONE`
- `DEFAULT_CHECK_IN_TIME`
- `DEFAULT_CHECK_IN_END_TIME`
- `DEFAULT_CHECK_OUT_TIME`
- `ENABLE_GOOGLE_CALENDAR_SYNC` — `true` pour activer la synchronisation Google Calendar (sinon `false`)
- `MIN_STAY_NIGHTS_PARKING_SPACE`
- `MIN_STAY_NIGHTS_ECO_STUDIO`
- `ADMIN_NOTIFICATION_EMAIL` — destinataire en copie de chaque e-mail transactionnel
- `EMAIL_FROM` — expediteur des e-mails transactionnels (format `Nom <adresse@domaine>`) ; requis, l'envoi est desactive tant qu'il manque
- `EMAIL_REPLY_TO` — adresse de reponse ; si absente, les reponses partent vers l'expediteur
- `GARAGE_INSTRUCTIONS` — JSON objet cle par code de langue (`fr`, `en`, `de`, `es`, `pt`, `it`, `nl`) ; injecte le contenu du placeholder `__GARAGE_INSTRUCTIONS__` dans l'e-mail d'arrivee parking. Valeur `{}` = aucune instruction. Le JSON doit rester valide : les retours a la ligne dans un texte doivent etre echappes en `\n` (des retours a la ligne bruts rendent le JSON invalide et l'instruction est silencieusement ignoree).
- `WHATSAPP_LINE` — ligne WhatsApp de contact ; injecte dans `__WHATSAPP_LINE__` des e-mails
- `STUDIO_ADDRESS` — adresse du studio ; injecte dans `__STUDIO_ADDRESS__` (confirmation et arrivee studio). Accepte une chaine simple **ou** un objet JSON cle par langue (`fr`/`en`/`de`...) pour localiser le nom du pays ; les langues sans cle reçoivent la valeur anglaise
- `KEY_BOX_STUDIO_CODE` — code de la boite a cle studio ; injecte dans `__KEY_BOX_STUDIO_CODE__`
- `REVIEW_LINK_PARKING` — lien d'avis Google pour le parking ; injecte dans `__REVIEW_LINK__` de l'e-mail de demande d'avis. Configuree comme variable Cloudflare Pages (production + preview) : https://g.page/r/CbsI1IDQnZP4EBM/review
- `REVIEW_LINK_STUDIO` — lien d'avis Google pour le studio ; injecte dans `__REVIEW_LINK__` de l'e-mail de demande d'avis. Configuree comme variable Cloudflare Pages (production + preview) : https://g.page/r/Ca5HhJ5WSkT6EBM/review
- `SUMUP_API_BASE_URL`

Secrets ou valeurs sensibles (la liste complete des 9 secrets du projet) :

- `SUMUP_API_KEY`
- `SUMUP_MERCHANT_CODE`
- `SUMUP_WEBHOOK_SECRET` — verifie la signature HMAC-SHA256 du webhook SumUp
- `INTERNAL_SYNC_TOKEN`
- `ADMIN_ACCESS_TOKEN`
- `RESEND_API_KEY`
- `NTFY_TOPIC_URL` — URL du topic ntfy.sh pour les notifications push hote
- `WIFI_STUDIO_PASSWORD` — mot de passe Wi-Fi devant le garage (`__WIFI_STUDIO_PASSWORD__`)
- `WIFI_TERRACE_PASSWORD` — mot de passe Wi-Fi de la terrasse (`__WIFI_TERRACE_PASSWORD__`)
- `KEY_BOX_STUDIO_CODE` — boite a cle du studio
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

Configurer un secret depuis la CLI (wrangler authentifie) :

```bash
npx wrangler pages secret put SUMUP_MERCHANT_CODE --project-name candc-ch
```

Le terminal demande la valeur (interactif, rien n'est logge).

Piège important : un secret ajoute/modifie ne s'applique qu'aux **nouveaux deployments**. Apres tout ajout de variable ou secret, relancer un deployment (push git, bouton `Create deployment`, ou `wrangler pages deploy`).

Verifier les secrets configures :

```bash
npx wrangler pages secret list --project-name candc-ch
```

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
- l'import est stocke en base dans `external_calendar_sources.import_url`
- l'export ICS est resolu par `external_calendar_sources.export_feed_token`
- il n'y a plus de variable globale `BOOKING_ICS_*`, pour eviter les confusions entre parking et studio

### SumUp

- checkout heberge
- webhook de confirmation de paiement
- credentials requis avant usage reel

Les deux secrets suivants sont requis ensemble pour activer le checkout heberge :

- `SUMUP_API_KEY`
- `SUMUP_MERCHANT_CODE`

Si l'un des deux manque, la reservation est creee (statut `pending_payment`) mais la reponse API contient `payment.status = "configuration_required"` et le front affiche `Booking created, but payment is not configured yet.`. Aucun lien de paiement n'est alors genere.

Recuperation du `SUMUP_MERCHANT_CODE` :

```bash
curl https://api.sumup.com/v0.1/me \
  -H "Authorization: Bearer TON_SUMUP_API_KEY"
```

Puis lire :

- `merchant_profile.merchant_code`

Alternative : le merchant code figure aussi dans `payments.raw_payload` en base D1 (champ `merchant_code` des reponses SumUp) :

```bash
npx wrangler d1 execute candc-booking --remote --command \
  "SELECT raw_payload FROM payments WHERE raw_payload IS NOT NULL ORDER BY created_at DESC LIMIT 1;"
```

Verifier que le paiement est bien actif de bout en bout (reponse attendue : `payment.hostedCheckoutUrl` non null) :

Le plus simple : un script dedie cree une reservation factice a +45 jours, verifie qu'un lien de paiement SumUp est genere, puis annule la reservation automatiquement :

```bash
npm run check:payment
```

Options : `BASE_URL`, `UNIT_CODE`, `OFFSET_DAYS` (voir `scripts/check-live-payment.mjs`).

Alternative manuelle (curl) :

```bash
curl -s -X POST https://candc.ch/api/booking/reservations \
  -H 'content-type: application/json' \
  -d '{"unitCode":"parking-space","locale":"fr","checkInDate":"2026-09-01","checkOutDate":"2026-09-03","adults":1,"children":0,"infants":0,"vehicleType":"standard_car","wcShowerRequested":false,"nonRefundableSelected":false,"guestFirstName":"Test","guestLastName":"Test","guestEmail":"test@example.com","guestMobilePhone":"+41790000000","guestAddressStreet":"Rue 1","guestAddressZip":"1000","guestAddressCity":"Lausanne","guestAddressCountry":"CH","guestDateOfBirth":"1990-01-01","guestNationality":"CH","guestIdDocumentNumber":"","additionalGuests":[],"remarks":"","acceptedTerms":true}'
```

> **Piege connu (important)** : toute modification des variables d'environnement non secretes dans le dashboard Cloudflare (ou via PATCH API) peut **vider les valeurs des secrets** du projet, sans les supprimer des listes. Les deployments suivants partent alors avec des secrets vides (`payment.status = "configuration_required"`, emails `skipped`). Apres chaque edition d'env vars dans le dashboard :
>
> 1. re-poser TOUS les secrets ci-dessus (la liste des 9 secrets se trouve dans `wrangler.toml.example` et ci-dessous) ;
> 2. redeployer (push, meme vide) ;
> 3. verifier avec `npm run check:payment`.

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

- `RESEND_API_KEY` (secret)
- `EMAIL_FROM` — expediteur (format `Nom <adresse@domaine>`), requis : l'envoi est desactive tant qu'il manque
- `EMAIL_REPLY_TO` — adresse de reponse ; si vide, les reponses partent vers l'expediteur

### Admin

- la mini interface est accessible sur `/admin/booking`
- un token explicite est attendu via `ADMIN_ACCESS_TOKEN`
- la section `Long-stay discounts` permet maintenant de configurer jusqu'a `4` paliers par unite
- le formulaire affiche un feedback local de sauvegarde (`saving`, `success`, `error`)

### Jobs internes

- `POST /api/internal/jobs/run` peut lancer :
  - le sync Booking.com ICS
  - les e-mails d'arrivee
  - les e-mails de depart (studio, la veille a 18:00)
  - les e-mails de demande d'avis (jour du depart a 12:00)
  - la validation manuelle des feeds OTA
  - toutes en une seule execution (action `all`)

Important :

- le backend des jobs est pret
- le declenchement automatique est assure par le Worker Cloudflare `candc-cron-sync` (situe dans `sync-worker/`)
- ce Worker separe maintenant :
  - un cron horaire de sync calendrier
  - un cron distinct pour les e-mails d'arrivee, filtre sur `08:00` locale `Europe/Zurich`
  - un cron distinct pour les e-mails de depart, filtre sur `18:00` locale `Europe/Zurich`
  - un cron distinct pour les e-mails de demande d'avis, filtre sur `12:00` locale `Europe/Zurich`
- ce Worker requiert la variable secrete `INTERNAL_SYNC_TOKEN`
- en cas de reservation confirmee le jour meme apres 08:00 locale, l'e-mail d'arrivee est envoye immediatement par fallback sans attendre le prochain cron
- l'interface admin expose aussi :
  - un tableau de sante des sources calendaires
  - l'etat des derniers jobs operationnels
  - une action `Validate OTA feeds` pour verifier import et export ICS sans attendre un cron

## Notes importantes

- le systeme est deja concu pour supporter ensuite le studio dans le meme moteur
- la reservation parking est la premiere UX exposee
- les e-mails transactionnels, la page client de gestion et la mini interface admin sont deja en place
- la principale integration encore incomplete cote exploitation reste Google Calendar si les credentials Google ne sont pas encore finalises
