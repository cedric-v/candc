# Resume du projet C & C

## Etat actuel

Le repository contient maintenant deux couches principales :

- un site vitrine multilingue `Eleventy`
- un moteur de reservation en cours d'integration sur `Cloudflare Pages Functions`

## Fonctionnalites en place

### Site public

- pages marketing multilingues pour le parking et le studio
- support `fr`, `en`, `de`, `es`, `pt`, `it`, `nl`
- SEO de base : sitemap, hreflang, JSON-LD, robots
- CTA menant vers le funnel de reservation parking
- pages studio exposees avec lien vers le funnel de reservation direct

### Funnel de reservation parking

- page de reservation dediee par langue
- calcul de devis en direct via API
- selection des dates
- selection du type de vehicule
- adultes / enfants
- option WC-douche
- option non remboursable
- creation de reservation et redirection paiement si configure

### Funnel de reservation studio

- page de reservation dediee par langue
- calcul de devis en direct via API
- selection des dates
- adultes / enfants / bebes
- creation de reservation et redirection paiement si configure
- base `99 CHF` par nuit
- `7 CHF` par adulte supplementaire et par nuit
- `5 CHF` par enfant supplementaire et par nuit
- bebes `0-2` gratuits
- parking gratuit pour `1` vehicule
- terrasse privative incluse
- sejour minimum de `4` nuites
- remise `20 %` des `16` nuits
- remise `25 %` des `30` nuits
- remise `30 %` des `60` nuits
- remise `10 %` non remboursable
- remise `10 %` des `7` nuits, desormais integree a `Remise long sejour`

### Longs sejours par unite

- parking :
  - `10 %` des `7` nuits
  - `20 %` des `16` nuits
  - `25 %` des `30` nuits
  - `30 %` des `60` nuits
- studio :
  - `10 %` des `7` nuits
  - `20 %` des `16` nuits
  - `25 %` des `30` nuits
  - `30 %` des `60` nuits

Important :

- l'ancienne ligne visuelle `Remise 7+ nuits` a ete retiree
- toutes les remises longues sont desormais fusionnees dans la seule ligne `Remise long sejour`
- l'admin permet de configurer jusqu'a `4` paliers par unite

### Backend reservation

- modele multi-unite dans `D1`
- unites preparees :
  - `parking-space`
  - `eco-studio`
- disponibilite par unite
- tarification par unite et periodes tarifaires
- creation de reservations `pending_payment`
- flux ICS sortant par unite
- integration SumUp active
- import Booking.com ICS active
- import Airbnb ICS egalement possible si une source active existe pour l'unite
- en prod actuelle, le studio dispose aussi d'une source Airbnb importee
- Google Calendar sync implemente mais desactive par defaut tant qu'il n'est pas explicitement reactive
- e-mails transactionnels localises selon la langue de reservation (textes studio dispo en FR, EN, DE ; fallback EN pour es, pt, it, nl)
- page client de gestion via lien magique
- mini interface admin par token
- endpoint interne pour jobs de sync et d'e-mails, y compris le mail d'arrivee localise et le mail de depart studio
- remboursements automatiques SumUp pour les annulations flexibles et les diminutions de total, avec fallback manuel si la couverture transactionnelle est insuffisante
- tableau de sante admin pour les sources calendaires et les jobs operationnels
- validation OTA manuelle via l'admin pour verifier import et export ICS
- couche agent-ready avec `llms.txt`, `site-context.json` et WebMCP sur les parcours publics de reservation parking et studio
- logique d'e-mail d'arrivee adaptee aux reservations de derniere minute : si la reservation est confirmee le jour meme apres 8h locale, l'e-mail d'arrivee part immediatement au lieu d'attendre le cron du lendemain

## Posture securite

- validation serveur des payloads de devis et reservation
- token de gestion client aleatoire, stocke uniquement sous forme de hash
- webhook paiement revalide contre SumUp avant confirmation
- routes admin et sync internes protegees par token dedie
- sync Google Calendar desactivee par defaut
- depot public assaini : les URLs ICS, feed tokens, IDs de calendrier et valeurs `wrangler.toml` reelles ne doivent pas etre committes
- protections Cloudflare attendues en production sur les endpoints d'ecriture, en particulier `POST /api/booking/reservations`

## Ce qui est important architecturalement

Le systeme n'est plus pense uniquement pour le parking.

Les elements suivants sont deja scopes par unite :

- calendriers externes
- tarifs par periode
- blocages de disponibilite
- references de reservation
- parametres metier via `settings_json`

Cela permet d'exposer parking et studio dans le meme moteur sans grosse migration de schema.

## Etat agent-ready

Le systeme est maintenant prepare pour deux usages agents distincts :

- usage hors navigateur via fichiers de contexte :
  - `llms.txt`
  - `/.well-known/site-context.json`
- usage en navigateur via WebMCP progressif

Surfaces WebMCP actuellement exposees :

- funnel parking public :
  - `check_parking_availability`
  - `quote_parking_stay`
  - `start_parking_reservation_checkout`
- funnel studio public :
  - `check_studio_availability`
  - `quote_studio_stay`
  - `start_studio_reservation_checkout`
- page de gestion client :
  - `update_existing_reservation`

Le back-office admin n'est pas expose comme surface WebMCP publique.

## Ce qui manque encore

- reactivation eventuelle de Google Calendar avec credentials finalises
- observation continue en production des flux OTA reels, en particulier si un fournisseur renvoie un ICS vide

## Fichiers de reference

- `README.md`
- `BOOKING_SYSTEM_SPEC.md`
- `BOOKING_TECH_SETUP.md`
- `DEPLOYMENT.md`
- `AGENTS.md`
