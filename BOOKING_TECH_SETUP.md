# Booking Tech Setup

## Vue d'ensemble

Cette base technique ajoute :

- `functions/api/booking/*` pour les endpoints Pages Functions
- `functions/_lib/*` pour la logique partagee
- `migrations/0001_booking_schema.sql` pour initialiser D1
- `wrangler.toml.example` comme point de depart de configuration Cloudflare

L'architecture est maintenant concue autour d'un concept d'`unite reservable`.

Un parking et un studio peuvent donc partager :

- le meme moteur de reservation
- la meme base D1
- les memes primitives paiement / agenda / emails

tout en gardant :

- des calendriers separes
- des tarifs separes
- des flux ICS separes
- des regles metier qui peuvent diverger par unite
- des options et contraintes specifiques par unite via `settings_json`

## Endpoints MVP poses

- `GET /api/booking/availability?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /api/booking/quote`
- `POST /api/booking/reservations`
- `GET /api/booking/ics/:feedToken`
- `POST /api/booking/sumup/webhook`
- `GET /api/booking/manage/:token`
- `POST /api/booking/manage/:token`
- `POST /api/internal/sync/booking-ics`
- `POST /api/internal/sync/google-calendar`
- `POST /api/internal/jobs/run`
- `GET /api/admin/booking`
- `POST /api/admin/booking`

## Variables d'environnement attendues

- `PUBLIC_BASE_URL`
- `DEFAULT_BOOKING_UNIT_CODE`
- `TOURIST_TAX_ADULT_CHF`
- `WC_SHOWER_CLEANING_FEE_CHF`
- `PAYMENT_FEE_RATE`
- `PAYMENT_FEE_FIXED_CHF`
- `TIMEZONE`
- `DEFAULT_CHECK_IN_TIME`
- `DEFAULT_CHECK_OUT_TIME`
- `ADMIN_ACCESS_TOKEN`
- `ADMIN_NOTIFICATION_EMAIL`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO`
- `RESEND_API_KEY`
- `SUMUP_API_BASE_URL`
- `SUMUP_MERCHANT_CODE`
- `SUMUP_API_KEY`
- `INTERNAL_SYNC_TOKEN`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

## Recuperer le `SUMUP_MERCHANT_CODE`

Le plus rapide et le plus fiable est de le recuperer via l'API SumUp avec la cle API privee.

Exemple :

```bash
curl https://api.sumup.com/v0.1/me \
  -H "Authorization: Bearer TON_SUMUP_API_KEY"
```

Dans la reponse JSON :

- utiliser `merchant_profile.merchant_code`

Exemple de valeur :

- `REPLACE_WITH_SUMUP_MERCHANT_CODE`

Important :

- utiliser la cle API privee creee dans `Cles API`
- ne pas utiliser la `Cle API publique`

## Frais de paiement actuellement appliques

Configuration produit retenue pour le parking :

- `PAYMENT_FEE_RATE = 0.025`
- `PAYMENT_FEE_FIXED_CHF = 0`

Justification :

- cartes de debit SumUp : `1.5 %`
- cartes de credit SumUp : `2.5 %`
- comme le type de carte n'est pas connu de facon exploitable avant paiement dans le funnel actuel, le systeme applique `2.5 %` a tous les paiements

## Mise en place locale suggeree

1. Copier `wrangler.toml.example` vers `wrangler.toml`
2. Remplacer le `database_id`
3. Creer la base D1
4. Executer la migration SQL
5. Configurer les variables d'environnement Pages / Workers

## Exemple de commandes

```bash
cp wrangler.toml.example wrangler.toml
wrangler d1 create candc-booking
wrangler d1 execute candc-booking --file=./migrations/0001_booking_schema.sql
```

Si la base D1 existe deja et a ete creee avant le passage aux calendriers Google configures par unite, executer aussi :

```bash
wrangler d1 execute candc-booking --file=./migrations/0002_unit_scoped_calendar_config.sql
```

## Binding D1 a faire dans Cloudflare Pages

Le projet de reservation ne peut pas fonctionner en production sans binding D1 sur le projet Pages.

Le binding attendu par le code est :

- nom exact : `DB`

Sans cela, les routes comme :

- `GET /api/booking/availability`
- `POST /api/booking/quote`
- `POST /api/booking/reservations`

renverront une erreur de type :

- `Missing D1 binding: DB`

Etapes manuelles dans Cloudflare :

1. ouvrir `Workers & Pages`
2. ouvrir le projet Pages du site
3. aller dans `Settings` -> `Bindings`
4. `Add` -> `D1 database`
5. definir `DB` comme `Variable name`
6. selectionner la base `candc-booking` ou la base D1 equivalente
7. enregistrer
8. redeployer le projet

Verifier ensuite :

- que les migrations ont bien ete executees
- que le binding existe bien sur l'environnement `Production`
- et si besoin aussi sur `Preview`

## Etat actuel

Le scaffold couvre :

- le modele multi-unite pour accueillir plus tard le studio sans refonte majeure
- des regles metier parametrables par unite via `rentable_units.settings_json`
- validation des payloads
- calcul des prix
- gestion des periodes tarifaires par unite
- creation d'une reservation `pending_payment`
- blocage calendrier associe a une unite
- generation d'un token de gestion
- export ICS de base par unite
- creation d'un Hosted Checkout SumUp si les credentials sont configures
- webhook SumUp pour confirmer ou liberer la reservation selon le statut de paiement
- import Booking.com ICS par endpoint interne authentifie
- remplacement des blocages externes importes par unite
- journalisation des synchronisations dans `sync_logs`
- synchro Google Calendar par reservation confirmee
- mise a jour automatique Google Calendar depuis le webhook SumUp si la configuration est presente
- e-mail transactionnel de creation de reservation
- e-mails de modification, annulation et rappel d'arrivee
- page client de gestion de reservation via lien magique
- mini interface admin protegee par token
- endpoint interne unifie pour lancer les jobs Booking ICS et arrival emails

Le scaffold ne couvre pas encore :

- remboursement automatique SumUp
- cron Cloudflare effectivement deployee depuis ce repo
- parcours front dedie studio

## Charges utiles attendues

### `POST /api/booking/quote`

```json
{
  "unitCode": "parking-space",
  "locale": "fr",
  "checkInDate": "2026-06-10",
  "checkOutDate": "2026-06-12",
  "vehicleType": "van",
  "adults": 2,
  "children": 1,
  "wcShowerRequested": true,
  "nonRefundableSelected": false
}
```

### `POST /api/booking/reservations`

```json
{
  "unitCode": "parking-space",
  "locale": "fr",
  "checkInDate": "2026-06-10",
  "checkOutDate": "2026-06-12",
  "vehicleType": "van",
  "adults": 2,
  "children": 1,
  "wcShowerRequested": true,
  "nonRefundableSelected": false,
  "guestFirstName": "Jean",
  "guestLastName": "Dupont",
  "guestEmail": "jean@example.com",
  "guestPhone": "+41790000000",
  "remarks": "Arrivee vers 18h",
  "acceptedTerms": true
}
```

## Etape recommandee suivante

1. configurer le service account Google Calendar et partager le calendrier avec son e-mail
2. configurer Resend (`RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`)
3. creer `ADMIN_ACCESS_TOKEN`
4. brancher un scheduler externe ou Cloudflare adapte vers `POST /api/internal/jobs/run`

## Extension future studio

Pour brancher ensuite le studio, la base est deja prete pour :

- creer des periodes tarifaires propres au studio
- avoir un flux Booking.com ICS dedie au studio
- gerer un agenda interne separe
- exposer un funnel front avec `unitCode: "eco-studio"`

La principale evolution restante sera metier et UX :

- champs specifiques studio
- pricing specifique studio
- politiques de sejour propres au studio

## Verification studio readiness

Etat actuel :

- pret pour un autre agenda Booking.com par unite
- pret pour d'autres tarifs via `rate_periods`
- pret pour des regles propres au studio via `settings_json`
- pret pour ne pas exiger les donnees vehicule sur les unites non parking

Ce qui restera a faire pour activer vraiment le studio :

- creer le funnel front studio
- definir les options et conditions propres au studio
- ajuster le contenu des e-mails pour le studio

## Synchronisation Booking ICS

Le flux d'import fonctionne par unite reservable.

Sources d'URL prises en charge :

- `external_calendar_sources.import_url` pour l'import par unite
- `external_calendar_sources.export_feed_token` pour l'export ICS par unite

Important :

- il n'y a plus de variable globale `BOOKING_ICS_*`
- cela evite toute ambiguite entre parking et studio

Authentification requise :

- header `Authorization: Bearer <INTERNAL_SYNC_TOKEN>`
- ou header `x-internal-sync-token: <INTERNAL_SYNC_TOKEN>`

Exemple de charge utile :

```json
{
  "unitCode": "parking-space"
}
```

Si le body est vide, l'endpoint tente de synchroniser toutes les sources actives `booking` declarees en base.

Comportement :

- telecharge le flux ICS Booking
- parse les `VEVENT`
- remplace les blocages externes existants pour l'unite concernee
- journalise le resultat dans `sync_logs`

## Synchronisation Google Calendar

Le calendrier interne partage est alimente reservation par reservation.

Configuration necessaire :

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- un `google_calendar_id` renseigne sur l'unite concernee dans `rentable_units`

Important :

- il faut partager le Google Calendar cible avec l'adresse e-mail du service account
- le service account doit avoir le droit de modifier les evenements

Declenchement :

- automatique apres paiement confirme via le webhook SumUp
- manuel ou de rattrapage via `POST /api/internal/sync/google-calendar`

Exemple de charge utile :

```json
{
  "reservationId": "REPLACE_WITH_RESERVATION_ID"
}
```

Contenu envoye dans l'evenement :

- nom complet du voyageur
- type de vehicule
- adultes et enfants
- remarques
- total et statut de paiement
- reference de reservation
- unite reservee

## Gestion client

Le lien magique de gestion pointe vers :

- `GET /booking/manage/:token`

L'API associee permet :

- lecture de la reservation
- previsualisation d'une modification
- modification des dates et de l'option WC-douche
- annulation si la politique le permet

Comportement actuel :

- si le nouveau total augmente, un checkout SumUp d'ajustement est cree
- si le nouveau total diminue, un remboursement manuel est marque comme du

## Interface admin minimale

La mini interface est exposee sur :

- `GET /admin/booking`

Elle consomme :

- `GET /api/admin/booking`
- `POST /api/admin/booking`

Fonctions en place :

- voir les reservations recentes
- voir les periodes tarifaires
- creer une periode tarifaire speciale
- voir les logs de synchro recents
- lancer manuellement le sync Booking.com
- lancer manuellement les e-mails d'arrivee

## Jobs internes

Le point d'entree unique est :

- `POST /api/internal/jobs/run`

Actions prises en charge :

- `booking_ics`
- `arrival_emails`
- `all`

Exemple :

```json
{
  "action": "all"
}
```

Important :

- les handlers serveur sont prets
- le declenchement automatique doit encore etre branche sur le mode de deploiement Cloudflare retenu
