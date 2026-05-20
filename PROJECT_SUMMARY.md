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

### Funnel de reservation parking

- page de reservation dediee par langue
- calcul de devis en direct via API
- selection des dates
- selection du type de vehicule
- adultes / enfants
- option WC-douche
- option non remboursable
- creation de reservation et redirection paiement si configure

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
- Google Calendar sync pret, en attente de credentials definitifs
- e-mails transactionnels
- page client de gestion via lien magique
- mini interface admin par token
- endpoint interne pour jobs de sync et d'e-mails

## Ce qui est important architecturalement

Le systeme n'est plus pense uniquement pour le parking.

Les elements suivants sont deja scopes par unite :

- calendriers externes
- tarifs par periode
- blocages de disponibilite
- references de reservation
- parametres metier via `settings_json`

Cela permet de brancher le studio plus tard sans grosse migration de schema.

## Ce qui manque encore

- remboursement automatique SumUp
- declenchement cron reel cote Cloudflare
- credentials Google Calendar finalises
- funnel dedie au studio

## Fichiers de reference

- `README.md`
- `BOOKING_SYSTEM_SPEC.md`
- `BOOKING_TECH_SETUP.md`
- `DEPLOYMENT.md`
- `AGENTS.md`
