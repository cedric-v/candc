# État actuel : Témoignages et Images

## 📍 Localisation des fichiers

### Témoignages
- **Fichier de données** : `src/_data/testimonials.json`
- **Sections dans les pages** : Toutes les pages `eco-studio.njk` et `parking.njk` (FR, EN, DE, ES, PT) ont une section témoignages

### Images
- **Dossier** : `src/assets/img/`
- **Utilisation** : Les images sont référencées dans les pages et optimisées automatiquement par `eleventy-img`

## ✅ Ce qui est fait

### Structure
- ✅ Fichier `testimonials.json` créé avec structure pour 5 langues
- ✅ Sections témoignages ajoutées sur toutes les pages
- ✅ Dossier `src/assets/img/` créé
- ✅ Script `scripts/download-images.js` créé

### Témoignages actuels
- ⚠️ **Un seul témoignage générique** : "Nous sommes superhôtes sur Airbnb" (pour Studio et Parking)
- ⚠️ **Pas de vrais témoignages clients** récupérés depuis les sites sources

## ❌ Ce qui manque

### Témoignages à récupérer

#### Eco Studio
- **Source** : https://sites.google.com/view/cc-eco-studio/accueil-home?authuser=0
- **Témoignage visible** : "Nous sommes superhôtes sur AirBnb / We are superhost on AirBnB - C'est signe d'un accueil de qualité."
- **À faire** : Récupérer les vrais témoignages depuis la section "Témoignages / Testimonials" du site

#### Parking
- **Source** : https://sites.google.com/view/cc-parking-space/témoignages-testimonials?authuser=0
- **Section visible** : "Ce qu'ils en disent / What they say" avec "Quelques témoignages de voyageurs"
- **À faire** : Récupérer les témoignages complets depuis cette page

### Images à télécharger

#### Logo
- **Fichier** : `src/assets/img/logo-cc.jpg`
- **Status** : ❌ Manquant

#### Eco Studio
- **Source** : https://sites.google.com/view/cc-eco-studio/accueil-home?authuser=0
- **Images à récupérer** :
  - Vue extérieure du studio
  - Vue intérieure (chambre avec lit double)
  - Cuisine équipée
  - Salle de bain
  - Terrasse
  - Vue sur les champs
- **Status** : ❌ Aucune image téléchargée

#### Parking
- **Source** : https://sites.google.com/view/cc-parking-space/galerie-gallery?authuser=0
- **Images visibles sur le site** :
  - "The parking space (9 meters long)" - La place de stationnement (9 mètres de long)
  - "Terrace with a view" - Terrasse avec vue
  - "Access to a drinking water tap" - Accès à un robinet d'eau potable
  - "Toilet shower access" - Accès à un WC douche
- **Status** : ❌ Aucune image téléchargée

## 🔧 Comment récupérer

### Témoignages

1. **Visiter les pages sources** :
   - Studio : https://sites.google.com/view/cc-eco-studio/accueil-home?authuser=0
   - Parking : https://sites.google.com/view/cc-parking-space/témoignages-testimonials?authuser=0

2. **Copier les témoignages** et les ajouter dans `src/_data/testimonials.json` avec ce format :
```json
{
  "studio": {
    "fr": [
      {
        "author": "Nom du client",
        "rating": 5,
        "text": "Texte du témoignage...",
        "date": "2024-01-15",
        "source": "Airbnb"
      }
    ]
  }
}
```

### Images

1. **Visiter les galeries** :
   - Studio : https://sites.google.com/view/cc-eco-studio/accueil-home?authuser=0
   - Parking : https://sites.google.com/view/cc-parking-space/galerie-gallery?authuser=0

2. **Pour chaque image** :
   - Clic droit → "Ouvrir l'image dans un nouvel onglet"
   - Clic droit sur l'image en haute résolution → "Enregistrer l'image sous..."
   - Sauvegarder dans `src/assets/img/` avec un nom descriptif

3. **Noms recommandés** :
   - `logo-cc.jpg`
   - `studio-exterieur.jpg`
   - `studio-interieur.jpg`
   - `studio-cuisine.jpg`
   - `parking-vue.jpg`
   - `parking-terrasse.jpg`
   - etc.

## 📝 Notes importantes

- Les témoignages s'afficheront automatiquement sur les pages s'ils sont présents dans `testimonials.json`
- Les images seront optimisées automatiquement (WebP, responsive) par `eleventy-img`
- Les sections témoignages sont conditionnelles (ne s'affichent que si des témoignages existent)
