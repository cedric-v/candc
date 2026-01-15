# Guide de récupération des images et témoignages

## 🖼️ Images

### Méthode recommandée : Téléchargement manuel

1. **Visiter les galeries** :
   - Eco Studio : https://sites.google.com/view/cc-eco-studio/galerie-gallery
   - Parking : https://sites.google.com/view/cc-parking-space/galerie-gallery

2. **Pour chaque image** :
   - Clic droit → "Ouvrir l'image dans un nouvel onglet"
   - Clic droit sur l'image en haute résolution → "Enregistrer l'image sous..."
   - Sauvegarder dans `src/assets/img/`

3. **Noms de fichiers recommandés** :
   - `logo-cc.jpg` - Logo principal
   - `studio-exterieur.jpg` / `studio-exterieur.webp`
   - `studio-interieur.jpg` / `studio-interieur.webp`
   - `studio-cuisine.jpg` / `studio-cuisine.webp`
   - `studio-salle-bain.jpg` / `studio-salle-bain.webp`
   - `studio-terrasse.jpg` / `studio-terrasse.webp`
   - `parking-vue.jpg` / `parking-vue.webp`
   - `parking-terrasse.jpg` / `parking-terrasse.webp`

## 💬 Témoignages

### Sources
- **Eco Studio** : https://sites.google.com/view/cc-eco-studio/temoignages-testimonials
- **Parking** : https://sites.google.com/view/cc-parking-space/temoignages-testimonials

### Format JSON

Ajouter les témoignages dans `src/_data/testimonials.json` :

```json
{
  "studio": {
    "fr": [
      {
        "author": "Nom du client",
        "rating": 5,
        "text": "Texte du témoignage...",
        "date": "2024-01-15",
        "source": "Airbnb",
        "url": "https://..." // optionnel
      }
    ]
  }
}
```

### Informations à récupérer

Pour chaque témoignage :
- ✅ Nom de l'auteur
- ✅ Note (1-5 étoiles)
- ✅ Texte complet
- ✅ Date
- ✅ Source (Airbnb, Booking.com)
- ✅ URL du témoignage (optionnel)

## 📋 Checklist

- [ ] Logo téléchargé (`logo-cc.jpg`)
- [ ] Images Eco Studio téléchargées (min. 3-5)
- [ ] Images Parking téléchargées (min. 2-3)
- [ ] Témoignages Eco Studio ajoutés dans `testimonials.json`
- [ ] Témoignages Parking ajoutés dans `testimonials.json`
- [ ] Images converties en WebP (optionnel)
- [ ] Vérification visuelle des pages
