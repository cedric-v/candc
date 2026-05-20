#!/usr/bin/env node

/**
 * Smoke tests pour valider les routes et CTA du site C & C
 */

const fs = require('fs');
const path = require('path');

const languages = ['fr', 'en', 'de', 'es', 'pt', 'it', 'nl'];
const pages = ['', 'eco-studio', 'parking', 'contact'];
const bookingPages = ['parking/booking', 'eco-studio/booking'];
const baseDir = path.join(__dirname, '..', '_site');
const studioSelfCheckInMarkers = {
  fr: "Arrivée autonome 24 h/24",
  en: "Self check-in 24/7",
  de: "Autonome Anreise rund um die Uhr",
  es: "Llegada autónoma 24/7",
  pt: "Chegada autónoma 24/7",
  it: "Arrivo autonomo 24/7",
  nl: "Autonome aankomst 24/7",
};

let errors = [];
let warnings = [];

console.log('🧪 Running smoke tests...\n');

// Test 1: Vérifier que le build a généré les fichiers
if (!fs.existsSync(baseDir)) {
  console.error('❌ Build directory not found. Run "npm run build" first.');
  process.exit(1);
}

// Test 2: Vérifier que toutes les pages existent
console.log('📄 Checking pages exist...');
for (const lang of languages) {
  for (const page of pages) {
    const pagePath = page === '' ? `/${lang}/index.html` : `/${lang}/${page}/index.html`;
    const fullPath = path.join(baseDir, pagePath);

    if (!fs.existsSync(fullPath)) {
      errors.push(`Missing page: ${pagePath}`);
    } else {
      console.log(`  ✓ ${pagePath}`);
    }
  }

  for (const page of bookingPages) {
    const pagePath = `/${lang}/${page}/index.html`;
    const fullPath = path.join(baseDir, pagePath);

    if (!fs.existsSync(fullPath)) {
      errors.push(`Missing page: ${pagePath}`);
    } else {
      console.log(`  ✓ ${pagePath}`);
    }
  }
}

// Test 3: Vérifier les CTA principaux
console.log('\n🔗 Checking CTAs in pages...');
for (const lang of languages) {
  for (const page of pages) {
    const pagePath = page === '' ? `/${lang}/index.html` : `/${lang}/${page}/index.html`;
    const fullPath = path.join(baseDir, pagePath);

    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');

      // Vérifier qu'une page de presentation conserve au moins un CTA de reservation pertinent.
      if (page === 'eco-studio' || page === 'parking') {
        const hasDirectBookingCta = content.includes('/booking/') || content.includes('checkAvailability');
        const hasOtaLink = content.includes('booking.com') || content.includes('airbnb');

        if (!hasDirectBookingCta && !hasOtaLink) {
          warnings.push(`${pagePath}: Missing booking CTA`);
        }
      }

      if (page === 'eco-studio') {
        if (!content.includes('featured-testimonial-card')) {
          warnings.push(`${pagePath}: Missing featured studio testimonial`);
        }

        const selfCheckInMarker = studioSelfCheckInMarkers[lang];
        if (selfCheckInMarker && !content.includes(selfCheckInMarker)) {
          warnings.push(`${pagePath}: Missing localized self check-in reassurance block`);
        }
      }

      if (page === 'parking') {
        if (!content.includes('featured-testimonial-card')) {
          warnings.push(`${pagePath}: Missing featured parking testimonials`);
        }
      }

      // Vérifier WhatsApp (sur contact et index)
      if (page === 'contact' || page === '') {
        if (!content.includes('wa.me') && !content.includes('WhatsApp')) {
          warnings.push(`${pagePath}: Missing WhatsApp link`);
        }
      }

      // Vérifier Email obfuscation
      if (page === 'contact' || page === '') {
        if (!content.includes('emailParts') && !content.includes('bonjour@candc.ch')) {
          warnings.push(`${pagePath}: Missing email obfuscation`);
        }
      }
    }
  }
}

// Test 4: Vérifier sitemap.xml
console.log('\n🗺️  Checking sitemap.xml...');
const sitemapPath = path.join(baseDir, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');

  // Vérifier hreflang pour toutes les langues
  for (const lang of languages) {
    if (!sitemap.includes(`hreflang="${lang}"`)) {
      errors.push(`Sitemap missing hreflang for ${lang}`);
    }
  }

  const requiredBookingUrls = [
    'https://candc.ch/fr/parking/booking/',
    'https://candc.ch/fr/eco-studio/booking/',
  ];

  for (const url of requiredBookingUrls) {
    if (!sitemap.includes(`<loc>${url}</loc>`)) {
      errors.push(`Sitemap missing booking URL ${url}`);
    }
  }

  console.log('  ✓ sitemap.xml exists with hreflang');
} else {
  errors.push('sitemap.xml not found');
}

// Test 5: Vérifier robots.txt
console.log('\n🤖 Checking robots.txt...');
const robotsPath = path.join(baseDir, 'robots.txt');
if (fs.existsSync(robotsPath)) {
  const robots = fs.readFileSync(robotsPath, 'utf8');
  if (!robots.includes('sitemap.xml')) {
    warnings.push('robots.txt missing sitemap reference');
  }
  console.log('  ✓ robots.txt exists');
} else {
  warnings.push('robots.txt not found');
}

// Résumé
console.log('\n' + '='.repeat(50));
if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ All tests passed!');
  process.exit(0);
} else {
  if (errors.length > 0) {
    console.log(`\n❌ Errors (${errors.length}):`);
    errors.forEach(err => console.log(`  - ${err}`));
  }
  if (warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${warnings.length}):`);
    warnings.forEach(warn => console.log(`  - ${warn}`));
  }
  process.exit(errors.length > 0 ? 1 : 0);
}
