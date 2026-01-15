# Guide de récupération des images et témoignages

## 📸 Images à récupérer

### Méthode 1 : Téléchargement manuel (recommandé)

1. **Visiter les sites sources** :
   - Eco Studio : https://sites.google.com/view/cc-eco-studio/galerie-gallery
   - Parking : https://sites.google.com/view/cc-parking-space/galerie-gallery

2. **Pour chaque image** :
   - Clic droit sur l'image → "Ouvrir l'image dans un nouvel onglet"
   - Clic droit sur l'image en haute résolution → "Enregistrer l'image sous..."
   - Sauvegarder dans `src/assets/img/` avec un nom descriptif

3. **Images prioritaires** :

#### Eco Studio
- `studio-exterieur.jpg` - Vue extérieure
- `studio-interieur.jpg` - Vue intérieure (chambre)
- `studio-cuisine.jpg` - Cuisine équipée
- `studio-salle-bain.jpg` - Salle de bain
- `studio-terrasse.jpg` - Terrasse
- `studio-vue-champs.jpg` - Vue sur les champs
- `studio-vue-village.jpg` - Vue du village/forêt

#### Parking
- `parking-vue-generale.jpg` - Vue générale de l'aire
- `parking-terrasse.jpg` - Terrasse avec vue
- `parking-prise-electrique.jpg` - Prise électrique
- `parking-robinet.jpg` - Robinet extérieur
- `parking-emplacement.jpg` - Vue d'ensemble

#### Logo
- `logo-cc.jpg` - Logo C & C (200x200px recommandé)

### Méthode 2 : Utilisation du script

1. Identifier les URLs des images depuis les sites sources
2. Ajouter les URLs dans `scripts/download-images.js`
3. Exécuter : `node scripts/download-images.js`

## 💬 Témoignages à récupérer

### Sources
- **Eco Studio** : https://sites.google.com/view/cc-eco-studio/temoignages-testimonials
- **Parking** : https://sites.google.com/view/cc-parking-space/temoignages-testimonials

### Format des témoignages

Les témoignages doivent être ajoutés dans `src/_data/testimonials.json` avec ce format :

```json
{
  "studio": {
    "fr": [
      {
        "author": "Nom du client",
        "rating": 5,
        "text": "Texte du témoignage en français",
        "date": "2024-01-15",
        "source": "Airbnb"
      }
    ],
    "en": [
      {
        "author": "Client Name",
        "rating": 5,
        "text": "Testimonial text in English",
        "date": "2024-01-15",
        "source": "Airbnb"
      }
    ]
  }
}
```

### Informations à récupérer pour chaque témoignage

1. **Nom de l'auteur** (ou "Anonyme" si non disponible)
2. **Note** (1-5 étoiles)
3. **Texte du témoignage** (dans toutes les langues disponibles)
4. **Date** (format YYYY-MM-DD)
5. **Source** (Airbnb, Booking.com, etc.)
6. **URL du témoignage** (optionnel, pour lien vers la source)

## 🔄 Conversion WebP (optionnel mais recommandé)

Pour optimiser les images, convertir en WebP :

```bash
# Avec ImageMagick
convert studio-exterieur.jpg studio-exterieur.webp

# Ou avec cwebp (Google)
cwebp -q 80 studio-exterieur.jpg -o studio-exterieur.webp
```

Le système eleventy-img générera automatiquement les versions WebP si les fichiers sont présents.

## ✅ Checklist

- [ ] Logo C & C téléchargé et placé dans `src/assets/img/logo-cc.jpg`
- [ ] Images Eco Studio téléchargées (minimum 3-5 images)
- [ ] Images Parking téléchargées (minimum 2-3 images)
- [ ] Témoignages Eco Studio récupérés et ajoutés dans `testimonials.json`
- [ ] Témoignages Parking récupérés et ajoutés dans `testimonials.json`
- [ ] Images converties en WebP (optionnel)
- [ ] Vérification que toutes les images s'affichent correctement

## 📝 Notes

- Les images seront automatiquement optimisées par eleventy-img lors du build
- Les formats WebP seront générés automatiquement si les fichiers sources existent
- Les témoignages s'afficheront automatiquement sur les pages si présents dans `testimonials.json`
