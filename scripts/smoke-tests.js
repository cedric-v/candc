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

// Test 3: Vérifier les CTA (Booking.com, Airbnb, WhatsApp, Email)
console.log('\n🔗 Checking CTAs in pages...');
for (const lang of languages) {
  for (const page of pages) {
    const pagePath = page === '' ? `/${lang}/index.html` : `/${lang}/${page}/index.html`;
    const fullPath = path.join(baseDir, pagePath);

    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');

      // Vérifier Booking.com
      if (!content.includes('booking.com') && !content.includes('Booking.com')) {
        warnings.push(`${pagePath}: Missing Booking.com link`);
      }

      // Vérifier Airbnb
      if (!content.includes('airbnb.com') && !content.includes('Airbnb')) {
        warnings.push(`${pagePath}: Missing Airbnb link`);
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
