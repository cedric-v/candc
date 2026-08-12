# Systeme de reservation parking C & C

## Objectif

Mettre en place un systeme de reservation directe pour la place de parking C & C, afin de reduire les echanges manuels via WhatsApp, d'ameliorer la conversion, et d'offrir une experience proche de Booking.com ou Airbnb tout en restant simple a administrer.

Le systeme doit :

- afficher un calendrier de disponibilite
- permettre la reservation et le paiement en ligne
- se synchroniser avec Booking.com via ICS
- exporter les reservations directes en ICS
- alimenter un Google Calendar interne partage
- fonctionner dans toutes les langues deja supportees par le site
- permettre au client de gerer sa reservation via un lien securise dans l'e-mail
- permettre a l'hote de gerer les tarifs par periode via une mini interface admin

## Contexte technique

Le site actuel est un site statique Eleventy deploye sur Cloudflare Pages.

Architecture cible recommandee :

- front public : Eleventy + JS progressif
- API : Cloudflare Pages Functions
- base de donnees : Cloudflare D1
- taches planifiees : Cloudflare Cron Triggers
- cache facultatif : Cloudflare KV
- paiement MVP : SumUp Hosted Checkout
- e-mails transactionnels : Resend via Worker

## Principe d'architecture evolutive

Bien que le premier usage cible soit la place de parking, l'architecture doit etre concue des maintenant autour d'un concept d'`unite reservable`.

Une unite reservable correspond a une offre reservable independante, par exemple :

- `parking-space`
- `eco-studio`

Chaque unite doit pouvoir disposer de maniere independante de :

- son calendrier
- ses sources ICS externes
- ses tarifs par periode
- son flux ICS sortant
- ses regles de disponibilite
- ses regles de pricing
- ses champs optionnels specifiques
- ses options vendables specifiques

Objectif :

- permettre d'ajouter ensuite le studio sans refonte profonde de la base ni de l'API

## Sources de verite et synchronisation

### Calendrier

Source de verite externe :

- Booking.com ICS

Regle de synchronisation :

- Booking.com ICS est importe regulierement dans le systeme
- les reservations directes du site sont stockees en base
- les reservations directes confirmees sont exportees dans un flux ICS du site
- ce flux ICS est reintegre dans Booking.com
- Airbnb continue de se synchroniser sur Booking.com et n'est donc pas traite comme source primaire

### Disponibilite

La place accepte :

- une seule reservation a la fois

A moyen terme, chaque unite reservable sera geree avec sa propre capacite.

Pour le MVP :

- parking-space : 1 reservation a la fois
- eco-studio : reserve pour usage futur, meme architecture

Le moteur de disponibilite doit tenir compte de :

- reservations directes confirmees
- blocs importes depuis Booking.com ICS
- blocages manuels admin
- reservations en attente de paiement pendant la fenetre de hold (par defaut 30 minutes, configurable via `PENDING_PAYMENT_HOLD_MINUTES`)

## Langues

Le systeme de reservation doit etre disponible dans toutes les langues actuellement supportees par le site :

- francais
- anglais
- allemand
- espagnol
- portugais
- italien
- neerlandais si ajoute au funnel actif du site

Le contenu dynamique suivant doit etre traduit :

- labels de formulaire
- etats de reservation
- recapitulatif tarifaire
- politiques d'annulation
- e-mails transactionnels
- interface de gestion de reservation
- interface admin si celle-ci est exposee en plusieurs langues

## Experience utilisateur cible

### Parcours public

1. L'utilisateur arrive sur la page parking.
2. Il clique sur le CTA principal pour verifier les disponibilites.
3. Il voit un calendrier clair, un recapitulatif des prestations incluses et un prix de base.
4. Il selectionne ses dates, le nombre d'adultes et d'enfants, et le type de vehicule.
5. Il choisit ou non l'option WC-douche.
6. Il voit un recapitulatif instantane du prix total, remises incluses, frais de paiement inclus.
7. Il renseigne ses informations de reservation.
8. Il paie via SumUp.
9. Il revient sur une page de confirmation.
10. Il recoit un e-mail avec un lien securise pour gerer sa reservation.

### Principes UX 2026 a respecter

- disponibilite visible des l'arrivee sur le funnel
- prix lisible, explique et mis a jour en temps reel
- zero compte obligatoire
- politique d'annulation visible avant paiement
- parcours mobile-first
- recapitulatif sticky sur mobile et desktop si pertinent
- preuve de confiance : photos, equipements, FAQ, avis, carte, details d'arrivee
- page de gestion ultra simple, orientee actions

## Contenu commercial et promesse de valeur

Le tarif de base doit clairement indiquer qu'il inclut :

- acces a l'electricite
- acces a l'eau potable
- gestion des dechets
- terrasse privative

Texte de recommandation pour le tunnel :

> Le tarif de base inclut l'emplacement, l'acces a l'electricite, l'eau potable, la gestion des dechets et la terrasse privative.

## Regles metier

### Horaires

- check-in : 15:00 a 21:00
- check-out : 10:00

### Types de vehicules

Le formulaire de reservation doit proposer :

- voiture standard
- voiture avec tente de toit
- van
- caravane
- camping-car jusqu'a 6.5 m
- camping-car de plus de 6.5 m

### Occupants

Champs obligatoires :

- nombre d'adultes
- nombre d'enfants

### Tarification

#### Tarif standard

- tarif de base standard : 20 CHF par nuitee

#### Prestations incluses dans le tarif de base

- place de stationnement
- electricite
- eau potable
- gestion des dechets
- terrasse privative

#### Taxes de sejour

- 3 CHF par adulte et par nuit
- 0 CHF par enfant de moins de 16 ans et par nuit

#### Option WC-douche

- 10 CHF pour les 7 premieres nuites, puis 10 CHF par semaine supplementaire (semaine entamee)
- option selectable pendant la reservation
- option modifiable ensuite depuis la page de gestion de reservation

#### Disponibilite WC-douche

L'option WC-douche est vendue comme disponible sur demande, lorsque l'hote est sur place.

Formulation recommandee :

> L'acces au WC et a la douche interieure est propose sur demande, lorsque nous sommes sur place, generalement entre 7h00 et 21h00. Nous faisons le maximum pour l'assurer aux voyageurs qui choisissent cette option, mais les horaires exacts peuvent exceptionnellement etre adaptes selon notre presence sur place.

#### Remise long sejour

- si duree du sejour >= 30 nuits : remise de 15 %

#### Regles non remboursables

- si reservation faite a moins de 24 heures de l'arrivee : reservation automatiquement non remboursable
- si reservation faite a plus de 24 heures de l'arrivee et que le client choisit volontairement le tarif non remboursable : remise supplementaire de 10 %
- la remise non remboursable volontaire reste applicable y compris sur les sejours de 30 nuits ou plus

#### Frais de paiement

- les frais du processeur de paiement doivent etre ajoutes au total
- ils doivent etre affiches comme ligne distincte dans le recapitulatif
- regle actuelle retenue pour SumUp : appliquer `2.5 %` a tous les paiements tant qu'il n'est pas possible de distinguer de facon fiable une carte de debit d'une carte de credit avant paiement

### Ordre de calcul recommande

1. calcul du sous-total hebergement : `tarif_de_base * nombre_de_nuits`
2. ajout des taxes adultes
3. ajout de l'option WC-douche si selectionnee
4. application de la remise long sejour si eligible
5. application de la remise non remboursable volontaire si eligible
6. ajout des frais de paiement
7. affichage du total final

### Tarifs par periode

Le systeme doit permettre de definir des exceptions tarifaires par plage de dates.

Exemple valide :

- du 20 mai 2026 au 31 mai 2026 : 40 CHF par nuit a cause des championnats du monde de hockey sur glace

Regles d'administration :

- un tarif par periode a une date de debut
- un tarif par periode a une date de fin
- un montant de tarif de base par nuit
- un libelle interne optionnel
- une priorite en cas de chevauchement
- un statut actif/inactif

### Politique d'annulation

- si annulation plus de 24 heures avant l'arrivee : remboursement integral
- si reservation automatique non remboursable parce que faite a moins de 24 heures : pas de remboursement
- si reservation volontairement non remboursable : pas de remboursement

### Modifications de reservation

Le client peut, via son lien securise :

- modifier ses dates
- ajouter l'option WC-douche
- retirer l'option WC-douche

Le systeme doit gerer :

- recalcul du prix si le total augmente
- encaissement d'un complement si le total augmente
- remboursement partiel si le total baisse

### Informations de reservation a collecter

- prenom
- nom
- e-mail
- telephone facultatif ou recommande
- type de vehicule
- longueur si categorie utile
- nombre d'adultes
- nombre d'enfants
- remarques
- dates de sejour
- option WC-douche
- acceptation des conditions

## Interface de gestion de reservation client

### Acces

Le client doit recevoir un lien securise dans l'e-mail de confirmation.

Ce lien ouvre une page permettant :

- d'afficher le recapitulatif de reservation
- de modifier les dates
- d'ajouter ou retirer l'option WC-douche
- de voir l'impact tarifaire avant confirmation
- de payer un complement si necessaire
- de recevoir un remboursement partiel si applicable
- d'annuler la reservation selon les regles

### Securite

Le lien doit reposer sur :

- un token unique aleatoire
- stockage hash du token en base
- expiration configurable
- possibilite de revocation

## Interface admin minimale

Une mini interface admin est requise.

### Fonctionnalites MVP

- voir la liste des reservations
- voir le detail d'une reservation
- voir le statut de paiement
- modifier le statut d'une reservation si necessaire
- creer un blocage manuel
- gerer les periodes de tarification
- relancer l'e-mail de confirmation
- relancer l'e-mail d'arrivee
- voir l'URL du flux ICS sortant
- consulter un journal simple des synchronisations et erreurs

### Fonctionnalite prioritaire de l'admin

- modifier le tarif de base via des periodes tarifaires

### Protection d'acces

Option recommandee MVP :

- interface protegee par authentification simple cote serveur

Option evolutive :

- protection via Cloudflare Access ou OAuth Google

## Integration Google Calendar

Chaque reservation confirmee doit creer ou mettre a jour un evenement dans un Google Calendar interne partage.

### Donnees a ecrire dans l'evenement

- nom complet du voyageur
- type de vehicule
- nombre d'adultes
- nombre d'enfants
- remarques
- statut reservation
- statut paiement
- option WC-douche demandee
- source de reservation
- lien interne admin si utile

### Comportement

- creation a la confirmation de reservation
- mise a jour lors des modifications
- annulation ou marquage adapte en cas d'annulation

## Integration ICS

### Import Booking.com

Un job planifie doit :

- telecharger le flux Booking.com ICS
- parser les evenements
- dedoublonner sur UID externe
- mettre a jour les blocs d'occupation
- journaliser le resultat de synchronisation

### Export ICS

Le systeme doit exposer un flux ICS contenant les reservations directes confirmees et les blocages pertinents.

Exigences :

- URL difficile a deviner
- lecture seule
- format compatible Booking.com

## Paiement

### Fournisseur recommande MVP

- SumUp Hosted Checkout

### Comportement

- creation d'un checkout cote serveur
- redirection client vers la page de paiement hebergee
- retour sur page de succes ou d'echec
- verification serveur du statut de paiement avant confirmation finale

### Cas a gerer

- paiement initial
- paiement complementaire apres modification
- remboursement partiel

## E-mails transactionnels

### E-mails a envoyer

- confirmation immediate de reservation
- copie a bonjour@candc.ch
- e-mail de mise a jour apres modification
- e-mail d'annulation
- e-mail de rappel de paiement (avant expiration du hold)
- e-mail d'expiration de paiement (dates liberees, reprise possible)
- e-mail d'arrivee le jour meme a 08:00
- e-mail de depart la veille a 18:00 (studio uniquement)

Les e-mails sont localises selon la langue de reservation. Les textes specifiques au studio (confirmation, arrivee, depart) sont disponibles en francais, anglais et allemand. Les autres langues recoivent la version anglaise.

### E-mail de confirmation immediate

Contenu attendu :

- recapitulatif de reservation
- lien de gestion
- politique d'annulation adaptee
- rappel de l'option WC-douche
- contact WhatsApp / messagerie

Texte a integrer :

> Access to an indoor toilet and shower is available on request, only when we are on site, between 7 a.m. and 9 p.m.

Si le service n'a pas deja ete achete, afficher aussi :

> This optional service costs CHF 10 for the first 7 nights, then CHF 10 per additional week.

Texte de fin :

> Cedric is available if needed via this messaging system or via WhatsApp https://wa.me/41766738311 (+41 76 673 83 11, messages only).
>
> We look forward to meeting you.
>
> See you soon,
> Celine and Cedric

### E-mail d'arrivee a 08:00 le jour J

Le message de base fourni par le client doit etre template, localisable et enrichi avec des variables.

Variables minimales :

- `FIRST_NAME`
- dates de sejour
- lien de gestion de reservation
- statut option WC-douche

Placeholder d'arrivee parking :

- `__GARAGE_INSTRUCTIONS__` — consignes specifiques garage, injectees depuis la variable d'environnement `GARAGE_INSTRUCTIONS` (JSON cle par code de langue : `fr`, `en`, `de`, `es`, `pt`, `it`, `nl`) ; si la cle ou la variable manque, la ligne est retiree proprement

Le bloc WC-douche dans ce mail doit rester informatif et cohérent avec l'achat effectif du service.

### E-mail de depart la veille a 18:00 (studio uniquement)

Le cron declenche a 18:00 heure locale pour les departs du lendemain.

Contenu attendu :
- prenom de l'invite (`__FIRST_NAME__`)
- heure de check-out (`__CHECKOUT_CLOSE_TIME__`)
- instructions de tri des dechets (recyclables, organiques, ordures)
- procedure de depart : fenetre en position oscillo-battante, porte fermee
- code de la boite a cle (`__KEY_BOX_STUDIO_CODE__`)

Le texte est disponible en francais, anglais et allemand.
Les autres langues recoivent la version anglaise (comme les e-mails de confirmation et d'arrivee studio).

### E-mail de demande d'avis le jour du depart a 12:00 (parking et studio)

Le cron declenche a 12:00 heure locale le jour du depart (`check_out_date` du jour).

Contenu attendu :
- prenom de l'invite (`__FIRST_NAME__`)
- lien d'avis Google, propre a l'unite (`__REVIEW_LINK__`), configure comme variable Cloudflare Pages (production + preview)
  - parking : `REVIEW_LINK_PARKING` = https://g.page/r/CbsI1IDQnZP4EBM/review
  - studio : `REVIEW_LINK_STUDIO` = https://g.page/r/Ca5HhJ5WSkT6EBM/review
- remerciement et formule de signature (Celine et Cedric)

Le message est localise dans la langue de reservation (7 langues).

Exemple (anglais) :

> Thank you for staying with us!
>
> Your feedback helps future travellers find the right spot, and it means a lot to our small family business.
>
> If you have a moment, we'd love to hear about your stay:
> Leave us a review → https://g.page/r/CbsI1IDQnZP4EBM/review
>
> Wishing you a great onward journey,
> Celine and Cedric

L'e-mail n'est envoye qu'une fois par reservation et par date (deduplication via le journal des e-mails, type `review_request`). Aucune ligne d'opt-out : un seul e-mail par sejour, sans liste de diffusion (interet legitime RGPD).

## Notifications push hôte (ntfy.sh)

Des notifications push temps reel sont envoyees a l'hote via ntfy.sh pour chaque evenement de reservation :

- **Nouvelle reservation** — unite, invite, dates, montant total
- **Annulation** — unite, invite, dates
- **Modification** — unite, invite, dates, delta CHF
- **Paiement confirme** — unite, invite, dates, statut confirme

La variable d'environnement `NTFY_TOPIC_URL` (URL du topic ntfy.sh) controle l'activation.
Si elle est absente, les notifications sont silencieusement ignorees.
Les echecs ntfy ne bloquent jamais les operations de reservation ou de paiement.

## Modele de donnees recommande

Le modele de donnees doit etre multi-unite.

### Table `rentable_units`

- `id`
- `code`
- `unit_type`
- `public_reference_prefix`
- `display_name`
- `currency`
- `default_base_rate`
- `check_in_start_time`
- `check_in_end_time`
- `check_out_time`
- `max_concurrent_reservations`
- `features_json`
- `settings_json`
- `is_active`
- `created_at`
- `updated_at`

### Table `external_calendar_sources`

- `id`
- `unit_id`
- `source_code`
- `source_kind`
- `import_url`
- `export_feed_token`
- `is_reference`
- `is_active`
- `last_synced_at`
- `created_at`
- `updated_at`

### Table `reservations`

- `id`
- `unit_id`
- `unit_code`
- `public_reference`
- `locale`
- `source`
- `status`
- `guest_first_name`
- `guest_last_name`
- `guest_email`
- `guest_phone`
- `vehicle_type`
- `vehicle_length_m`
- `adults`
- `children`
- `remarks`
- `guest_details_json`
- `check_in_date`
- `check_out_date`
- `check_in_start_time`
- `check_in_end_time`
- `check_out_time`
- `wc_shower_requested`
- `wc_shower_confirmed`
- `refundable_policy_type`
- `booked_at`
- `arrival_less_than_24h`
- `base_rate_snapshot`
- `base_amount`
- `tourist_tax_amount`
- `options_amount`
- `long_stay_discount_amount`
- `non_refundable_discount_amount`
- `payment_fee_amount`
- `total_amount`
- `currency`
- `google_calendar_event_id`
- `created_at`
- `updated_at`

### Table `payments`

- `id`
- `reservation_id`
- `provider`
- `provider_checkout_id`
- `provider_payment_reference`
- `type`
- `status`
- `amount`
- `currency`
- `raw_payload`
- `created_at`
- `updated_at`

### Table `rate_periods`

- `id`
- `unit_id`
- `start_date`
- `end_date`
- `nightly_base_rate`
- `label`
- `priority`
- `is_active`
- `created_at`
- `updated_at`

### Table `calendar_blocks`

- `id`
- `unit_id`
- `source`
- `external_uid`
- `reservation_id`
- `start_date`
- `end_date`
- `status`
- `created_at`
- `updated_at`

### Table `booking_tokens`

- `id`
- `reservation_id`
- `token_hash`
- `purpose`
- `expires_at`
- `revoked_at`
- `created_at`

### Table `sync_logs`

- `id`
- `unit_id`
- `sync_type`
- `status`
- `message`
- `payload_summary`
- `created_at`

### Table `email_logs`

- `id`
- `reservation_id`
- `email_type`
- `recipient`
- `status`
- `provider_message_id`
- `created_at`

## Endpoints API recommandes

### Public

- `GET /api/booking/availability`
- `POST /api/booking/quote`
- `POST /api/booking/reservations`
- `GET /api/booking/reservations/:token`
- `POST /api/booking/reservations/:token/requote`
- `POST /api/booking/reservations/:token/update`
- `POST /api/booking/reservations/:token/cancel`
- `GET /api/booking/ics/:feedToken`

### Admin

- `GET /api/admin/reservations`
- `GET /api/admin/reservations/:id`
- `POST /api/admin/reservations/:id/status`
- `GET /api/admin/rate-periods`
- `POST /api/admin/rate-periods`
- `PUT /api/admin/rate-periods/:id`
- `POST /api/admin/calendar-blocks`
- `GET /api/admin/sync-logs`
- `POST /api/admin/emails/:reservationId/resend`

### Jobs internes

- `POST /api/internal/sync/booking-ics`
- `POST /api/internal/sync/google-calendar`
- `POST /api/internal/jobs/send-arrival-emails`

## Taches planifiees

Le worker Cloudflare `candc-cron-sync` (`sync-worker/`) fonctionne sur **un seul cron `*/20 * * * *`** (contrainte du plan Workers Free : 5 crons max par compte, partages entre tous les workers). Toutes les 20 minutes il déclenche :

- `booking_ics` : import ICS Booking.com/Airbnb + maintenance des holds de paiement (rappels, expiration, e-mails) ;
- les e-mails d'arrivee / depart / avis, filtres en JS sur les fenetres locales (`08:00` / `18:00` / `12:00` `Europe/Zurich`), avec deduplication via `email_logs`.

### Synchronisation Booking ICS

Frequence recommandee MVP :

- toutes les 30 minutes

### Maintenance des holds de paiement

- toutes les 20 minutes (chaque passe du cron `*/20 * * * *`)
- envoi des rappels avant expiration, liberation des holds expires, e-mails d'expiration

### E-mails d'arrivee

Frequence recommande :

- cron frequent en UTC
- filtrage applicatif selon le fuseau `Europe/Zurich`
- envoi a 08:00 locale le jour d'arrivee

### E-mails de depart

- cron frequent en UTC, filtrage applicatif selon le fuseau `Europe/Zurich`
- envoi a 18:00 locale la veille du depart (studio uniquement)

### E-mails de demande d'avis

- cron frequent en UTC, filtrage applicatif selon le fuseau `Europe/Zurich`
- envoi a 12:00 locale le jour du depart (parking et studio)
- lien d'avis selon l'unite (`__REVIEW_LINK__`), message localise dans la langue de reservation

### Reconciliation paiements

Frequence recommandee :

- toutes les 15 a 30 minutes si necessaire en plus des retours de paiement

## Regles de disponibilite et conflits

### Hold de paiement

A la creation d'une reservation directe, un bloc calendrier `pending_payment` est cree et tient les dates pendant une fenetre configurable (`PENDING_PAYMENT_HOLD_MINUTES`, defaut 30 minutes). Pendant cette fenetre :

- le site bloque les memes dates pour les nouvelles reservations directes ;
- le flux ICS sortant est limite aux reservations confirmees (les holds non payes ne bloquent PAS Booking.com / autres OTA : l'ICS n'exporte que `confirmed`, `modified`, `refund_due`, `pending_refund`) ;
- a expiration, le bloc est libere, la reservation passe en `payment_expired` et le client recoit un e-mail.

### Statuts lies au paiement

- `pending_payment` : en attente du paiement initial, dates tenues pendant le hold.
- `payment_expired` : hold expire, dates liberees. Le client peut reprendre le paiement depuis son lien de gestion, mais la disponibilite est re-verifiee avant de relancer un checkout.
- `payment_setup_failed` : le checkout SumUp n'a pas pu etre cree (erreur de configuration/fournisseur).
- `conflict_refund_due` : le paiement est arrive alors que les dates avaient ete reprises ; la reservation n'est pas confirmee, un remboursement est declenche.
- `pending_adjustment_payment` : modification demandee avec paiement complementaire en attente ; si le hold expire sans paiement, la reservation reste confirmee sur les nouvelles dates (`modified`) et l'hote est notifie pour suivi.

### Verification en deux temps

Au moment de la creation du paiement (reservation initiale ou reprise de paiement) :

- revérifier la disponibilite
- refuser si un conflit apparait (la reprise de paiement `resume_payment` refuse avec 409 si les dates ne sont plus libres)

Au moment de la confirmation du paiement (webhook SumUp) :

- revérifier la disponibilite une deuxieme fois avant de confirmer
- si conflit critique, ne pas confirmer : remboursement (integral pour un paiement initial, du montant de l'ajustement pour un complement), passage en `conflict_refund_due` (initial) ou revert en `modified` (ajustement), bloc libere, hote et client notifies

### Rappel avant expiration

Un e-mail de rappel est envoye aux clients dont le hold expire bientot (fenetre `PENDING_PAYMENT_REMINDER_WINDOW_MINUTES`, defaut 20 minutes, bornee a la duree du hold) lors de chaque passe de maintenance (~20 min).

Pour limiter les collisions :

- possibilite d'ajouter un bloc temporaire de courte duree pendant le checkout

## Composants front a prevoir

- calendrier de disponibilite
- selecteur de voyageurs
- selecteur de type de vehicule
- case ou switch pour WC-douche
- module de recapitulatif tarifaire
- badge politique d'annulation
- page de confirmation
- page de gestion de reservation
- mini dashboard admin

## Priorites de livraison

### Phase 1 - MVP reservable

- D1 + schema SQL
- socle multi-unite parking + studio
- API disponibilite / devis / reservation
- import Booking ICS
- export ICS
- SumUp Hosted Checkout
- confirmation de reservation
- lien de gestion
- modifications client
- Google Calendar
- e-mail confirmation
- e-mail arrivee

### Phase 2 - Operations et robustesse

- mini admin complet
- logs et monitoring plus riches
- meilleurs outils de remboursement
- protections anti-conflits renforcees
- QA multilingue poussee

## Critères d'acceptation MVP

- un client peut reserver la place en ligne sans WhatsApp
- le calendrier reflete les indisponibilites Booking.com
- les reservations directes sortent en ICS
- Google Calendar contient les informations utiles d'exploitation
- le client peut modifier sa reservation via un lien e-mail
- le tarif par periode est editable dans l'admin
- l'option WC-douche peut etre ajoutee ou retiree
- les remises 30+ nuits et non remboursable sont correctement calculees
- les frais de paiement sont visibles
- toutes les langues supportees par le site peuvent etre servies

## Questions ouvertes restantes

Les points suivants pourront etre precises avant implementation finale, sans bloquer le cadrage :

- seuil exact de longueur a afficher ou collecter visuellement pour les camping-cars
- regle precise de remboursement automatique selon les contraintes de SumUp
- choix final du fournisseur d'e-mail transactionnel
- design final de l'admin et methode d'authentification

## Verification d'extensibilite studio

L'architecture est maintenant prete pour supporter ensuite le studio avec le meme outil, sans grande migration structurelle, car :

- les unites reservables sont separees par `unit_code` et `unit_id`
- chaque unite peut avoir son propre agenda Booking.com
- les tarifs par periode sont deja scopes par unite
- les blocages calendrier et exports ICS sont deja scopes par unite
- les reservations peuvent deja omettre les donnees vehicule
- les regles metier principales peuvent etre portees dans `settings_json` par unite

Les differences futures du studio pourront donc etre traitees principalement par :

- configuration de l'unite `eco-studio`
- funnel front dedie
- options et regles metier propres au studio
