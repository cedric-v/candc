# Mise à jour : Témoignages en images

## ✅ Modifications effectuées

### Structure mise à jour
1. **`src/_data/testimonials.json`** - Vidé et prêt pour les images
2. **Dossier créé** : `src/assets/img/testimonials/` (à créer manuellement si nécessaire)
3. **Pages mises à jour** : FR et EN pour Eco Studio et Parking

### Format JSON pour témoignages images

```json
{
  "studio": {
    "fr": [
      {
        "image": "studio-testimonial-01.jpg",
        "alt": "Témoignage client Airbnb - Studio"
      }
    ],
    "en": [
      {
        "image": "studio-testimonial-01.jpg",
        "alt": "Guest review Airbnb - Studio"
      }
    ]
  },
  "parking": {
    "fr": [
      {
        "image": "parking-testimonial-01.jpg",
        "alt": "Témoignage client Airbnb - Parking"
      }
    ]
  }
}
```

## 📝 Pages à mettre à jour

Les pages suivantes doivent être mises à jour pour utiliser le format image :
- ✅ `src/fr/eco-studio.njk` - FAIT
- ✅ `src/fr/parking.njk` - FAIT
- ✅ `src/en/eco-studio.njk` - FAIT
- ✅ `src/en/parking.njk` - FAIT
- ⏳ `src/de/eco-studio.njk` - À FAIRE
- ⏳ `src/de/parking.njk` - À FAIRE
- ⏳ `src/es/eco-studio.njk` - À FAIRE
- ⏳ `src/es/parking.njk` - À FAIRE
- ⏳ `src/pt/eco-studio.njk` - À FAIRE
- ⏳ `src/pt/parking.njk` - À FAIRE

## 🔧 Template à utiliser

Remplacer la section témoignages par :

```njk
<!-- Témoignages (images) -->
{% set pageTestimonials = testimonials.studio[locale] or testimonials.studio['fr'] or [] %}
{% if pageTestimonials and pageTestimonials.length > 0 %}
<section id="testimonials" class="mt-12">
  <div class="text-center mb-8">
    <h2 class="text-3xl font-bold text-[#2D5016] mb-4">Témoignages</h2>
    <p class="text-lg text-[#1f1f1f]/80">Ce que nos hôtes disent</p>
  </div>
  <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
    {% for testimonial in pageTestimonials %}
    <div class="section-card p-4 bg-white overflow-hidden">
      {% if testimonial.image %}
        {% set imagePath = "assets/img/testimonials/" + testimonial.image %}
        {% set imageAlt = testimonial.alt or "Témoignage client" %}
        {% image imagePath, imageAlt, "w-full h-auto rounded-lg", "lazy" %}
      {% endif %}
    </div>
    {% endfor %}
  </div>
</section>
{% endif %}
```

**Note** : Pour Parking, remplacer `testimonials.studio` par `testimonials.parking` et `text-[#2D5016]` par `text-[#5B6E7D]`.
