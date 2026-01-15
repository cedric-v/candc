# Guide : Télécharger les témoignages en images

## 📍 Structure des fichiers

### Dossier des images de témoignages
- **Chemin** : `src/assets/img/testimonials/`
- **Format** : Les images seront automatiquement optimisées (WebP, responsive) par `eleventy-img`

### Fichier de configuration
- **Chemin** : `src/_data/testimonials.json`
- **Format** : JSON avec structure pour chaque type (studio/parking) et chaque langue

## 📸 Comment télécharger les témoignages

### Étape 1 : Identifier les images de témoignages

#### Eco Studio
- **Source** : https://sites.google.com/view/cc-eco-studio/accueil-home?authuser=0
- **Section** : "Témoignages / Testimonials" ou section témoignages sur la page d'accueil
- **Action** : Repérer toutes les images de témoignages (captures d'écran d'avis Airbnb/Booking.com)

#### Parking
- **Source** : https://sites.google.com/view/cc-parking-space/témoignages-testimonials?authuser=0
- **Section** : "Ce qu'ils en disent / What they say" avec "Quelques témoignages de voyageurs"
- **Action** : Repérer toutes les images de témoignages

### Étape 2 : Télécharger les images

Pour chaque image de témoignage :

1. **Clic droit sur l'image** → "Ouvrir l'image dans un nouvel onglet"
2. **Clic droit sur l'image en haute résolution** → "Enregistrer l'image sous..."
3. **Sauvegarder dans** : `src/assets/img/testimonials/`
4. **Nommer les fichiers** de manière descriptive :
   - `studio-testimonial-01.jpg`
   - `studio-testimonial-02.jpg`
   - `parking-testimonial-01.jpg`
   - `parking-testimonial-02.jpg`
   - etc.

### Étape 3 : Ajouter les références dans testimonials.json

Une fois les images téléchargées, ajouter les références dans `src/_data/testimonials.json` :

```json
{
  "studio": {
    "fr": [
      {
        "image": "studio-testimonial-01.jpg",
        "alt": "Témoignage client Airbnb - Studio"
      },
      {
        "image": "studio-testimonial-02.jpg",
        "alt": "Témoignage client Booking.com - Studio"
      }
    ],
    "en": [
      {
        "image": "studio-testimonial-01.jpg",
        "alt": "Guest review Airbnb - Studio"
      },
      {
        "image": "studio-testimonial-02.jpg",
        "alt": "Guest review Booking.com - Studio"
      }
    ]
  },
  "parking": {
    "fr": [
      {
        "image": "parking-testimonial-01.jpg",
        "alt": "Témoignage client Airbnb - Parking"
      }
    ],
    "en": [
      {
        "image": "parking-testimonial-01.jpg",
        "alt": "Guest review Airbnb - Parking"
      }
    ]
  }
}
```

**Note** : Les mêmes images peuvent être utilisées pour toutes les langues si les témoignages sont multilingues (comme souvent sur Airbnb/Booking.com).

## ✅ Format JSON pour témoignages images

```json
{
  "image": "nom-du-fichier.jpg",
  "alt": "Texte alternatif pour l'accessibilité"
}
```

**Champs** :
- `image` : Nom du fichier dans `src/assets/img/testimonials/`
- `alt` : Texte alternatif pour l'accessibilité (recommandé mais optionnel)

## 🔄 Mise à jour automatique

Une fois les images ajoutées dans `testimonials.json` :
- ✅ Les images s'afficheront automatiquement sur toutes les pages
- ✅ Les images seront optimisées automatiquement (WebP, responsive)
- ✅ Le chargement sera lazy (chargement différé)
- ✅ Les sections témoignages sont conditionnelles (ne s'affichent que si des témoignages existent)

## 📋 Checklist

- [ ] Créer le dossier `src/assets/img/testimonials/` (déjà fait)
- [ ] Télécharger les images de témoignages Studio depuis le site source
- [ ] Télécharger les images de témoignages Parking depuis le site source
- [ ] Nommer les fichiers de manière descriptive
- [ ] Ajouter les références dans `testimonials.json` pour toutes les langues
- [ ] Vérifier l'affichage sur les pages

## 💡 Astuce

Si les témoignages sont identiques pour toutes les langues (comme souvent sur Airbnb/Booking.com), vous pouvez utiliser les mêmes images pour toutes les langues dans le JSON.
