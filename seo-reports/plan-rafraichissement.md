# Plan de rafraîchissement SEO — suivi et suite

> Données : GSC, 90 jours (2026-05 → 2026-08). Objectif : transformer des pages
> « Crawled - currently not indexed » qui reçoivent déjà des impressions en pages
> indexées qui cliquent.
>
> CSVs détaillés : `seo-reports/notindexed-vie.csv`, `seo-reports/notindexed-cedricv.csv`
> (générés par `node scripts/gsc.mjs` + `scripts` d'analyse ponctuels).

## ✅ Fait (2026-08-15) — vie-explosive.fr

| Article | Impressions 90j | Requête cible | Statut |
|---------|-----------------|---------------|--------|
| `/comment-devenir-plus-efficace-en-5-etapes/` | 36 | « être efficace » | **Rafraîchi** — titre « Comment être efficace : la méthode complète en 5 étapes », outils modernisés, liens internes |
| `/pourquoi-vous-ne-devez-absolument-pas-gagner-au-loto/` | 31 | « pourquoi je ne gagne jamais au loto » | **Rafraîchi** — titre aligné requête + section probabilités |
| `/qu-est-ce-qui-nous-fait-grossir/` | 14 | « ce qui fait grossir » | **Rafraîchi** — titre aligné, stats ObePi 2020, section ultra-transformés |
| `/trouver-le-bonheur-...-martin-seligman/` | 43 | « martin seligman » | **Rafraîchi** — titre aligné, liens Amazon cassés nettoyés |
| `/10-moyens-detre-plus-heureux-.../` | 49 | (diffuses) | **Rafraîchi** — date, typos, cross-links |

**Maillage interne ajouté** (liens entrants depuis articles indexés) :
- `/5-cles-pour-une-journee-plus-efficace/` → article « être efficace »
- `/avez-vous-une-vie-extraordinaire/` → article loto
- `/bienfaits-noix-amandes-sante/` → article prise de poids
- cross-links entre les 2 articles bonheur

**Autres corrections faites ce jour** (tous repos) :
- candc : script `gsc.mjs` + commande `audit` (outillage)
- fluance-io : sitemap 47→28 (agent/.well-known/auth/gated exclus), noindex pages auth + contenu réservé
- cedric-v : sitemap 189→186 (payment.js, COPYRIGHT, well-known exclus)
- techniquesdemeditation.com : sitemap 373→369, 17 posts `id-XXXX` → slugs propres + 301, doublon consolidé, admin/ + pages confirmation exclus
- devperso.org : sitemap 154→151, legacy pages supprimées (301 → /)
- vie-explosive : sitemap 461→456, 5 pages legacy noindexées

---

## ⏭️ Action immédiate (manuelle, GSC — dès que déployé)

1. **Resoumettre les sitemaps** dans GSC pour les 6 propriétés.
2. **Demander l'indexation** (max ~10/jour) pour :
   - vie-explosive : les 5 URLs rafraîchies ci-dessus
   - techniquesdemeditation.com : les nouvelles URLs renommées
     (ex. `/role-de-la-meditation-dans-les-arts-martiaux/`) — les anciennes
     `/id-XXXX/` suivront via les 301
3. Vérifier après 2-3 semaines (ré-audit : `node scripts/gsc.mjs audit --site sc-domain:vie-explosive.fr`).

---

## 📋 Suite recommandée

### vie-explosive.fr — articles « Priorité 2 » (signaux faibles, 4-11 imp)
À traiter plus tard, dans l'ordre :
1. `/criteres-choix-sport/` — « sélection sport » (10 imp) → titre « comment choisir son sport »
2. `/habitude-succes-numero-1-la-proactivite/` — « proactivité définition » (8 imp, pos 61-83) → section définition en tête
3. `/se-fixer-des-objectifs-et-garder-la-motivation/` — « fixer des objectifs motivants » (2 imp)
4. `/seminaire-upw-compte-rendu-partie-3/` — « upw » (pos 15) — seulement si UPW revient
5. `/un-esprit-sain-dans-un-corps-sain-12/` — consolider la série « un esprit sain »

### cedricv.com — stratégie jeune domaine (NE PAS rafraîchir en masse)
- **Attendre** : domaine publié en masse janv-sept 2024, l'autorité monte.
- Seul article avec vraie requête : `/decouvre-les-meilleurs-crm-pour-ton-business-b2c-vs-b2b/`
  (« crm b2b et b2c », 7 imp) → optimiser + demander l'indexation.
- Actions recommandées : maillage interne vers les 26 pages non indexées à impressions,
  demander l'indexation pour les ~10 meilleures FR, ralentir la publication.
- Les 36 versions `/en/` non indexées = comportement canonique normal (FR indexés).

### developpementpersonnel.org
- `/a-propos/` : GSC indique « exclu par noindex » mais la page actuelle est en
  `index, follow` (donnée GSC obsolète) → surveiller après déploiement, rien à faire.

### techniquesdemeditation.com — posts `id-XXXX` (rappel)
- 17 slugs renommés + 301. Vérifier après déploiement que les 301 répondent bien
  (curl -I https://techniquesdemeditation.com/id-4007/ → 301).

---

## 📈 Suivi (à refaire dans 2-3 semaines)

```bash
# Ré-audit d'indexation
node scripts/gsc.mjs audit --site sc-domain:vie-explosive.fr
node scripts/gsc.mjs audit --site sc-domain:cedricv.com

# Performance
node scripts/gsc.mjs performance --site sc-domain:vie-explosive.fr --days 90
```

Critères de succès : les 5 articles rafraîchis passent de « Crawled - currently
not indexed » à indexés, et leurs impressions se transforment en clics (CTR > 0).
