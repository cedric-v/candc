// eleventy.config.js
const i18n = require("eleventy-plugin-i18n");
const htmlmin = require("html-minifier-next");
const Image = require("@11ty/eleventy-img");
const fs = require("fs");
const path = require("path");

const PATH_PREFIX = process.env.ELEVENTY_ENV === 'prod' ? "" : "";

module.exports = function(eleventyConfig) {
  
  // 1. Gestion des Images avec eleventy-img (WebP responsive)
  eleventyConfig.addShortcode("image", async function(src, alt, cls = "", loading = "lazy", fetchpriority = "", width = "", height = "") {
    if (!src) return '';
    
    const cleanSrc = src.startsWith('/') ? src.slice(1) : src;
    const fullSrc = path.join(__dirname, 'src', cleanSrc);
    
    if (!fs.existsSync(fullSrc)) {
      console.warn(`Image not found: ${fullSrc}`);
      return `<img src="${src}" alt="${alt}" class="${cls}" ${loading ? `loading="${loading}"` : ''} ${fetchpriority ? `fetchpriority="${fetchpriority}"` : ''} ${width ? `width="${width}"` : ''} ${height ? `height="${height}"` : ''}>`;
    }
    
    try {
      const metadata = await Image(fullSrc, {
        widths: [300, 600, 900, 1200],
        formats: ["webp", "jpeg"],
        outputDir: path.join(__dirname, "_site", path.dirname(cleanSrc)),
        urlPath: `/${path.dirname(cleanSrc)}/`,
      });
      
      const loadingAttr = loading ? `loading="${loading}"` : '';
      const fetchpriorityAttr = fetchpriority ? `fetchpriority="${fetchpriority}"` : '';
      const widthAttr = width ? `width="${width}"` : '';
      const heightAttr = height ? `height="${height}"` : '';
      
      const webp = metadata.webp[metadata.webp.length - 1];
      const jpeg = metadata.jpeg[metadata.jpeg.length - 1];
      
      return `<picture>
        <source srcset="${webp.srcset}" type="image/webp">
        <img src="${jpeg.url}" alt="${alt}" class="${cls}" ${loadingAttr} ${fetchpriorityAttr} ${widthAttr} ${heightAttr}>
      </picture>`;
    } catch (error) {
      console.error(`Error processing image ${src}:`, error);
      return `<img src="${src}" alt="${alt}" class="${cls}" ${loadingAttr} ${fetchpriorityAttr} ${widthAttr} ${heightAttr}>`;
    }
  });

  // 2. Configuration i18n
  eleventyConfig.addPlugin(i18n, {
    translations: {},
    defaultLanguage: "fr"
  });

  // 3. Filtres de date
  eleventyConfig.addFilter("date", function(value, format, locale) {
    const date = value === "now" || !value ? new Date() : new Date(value);
    if (format === "yyyy") {
      return date.getFullYear().toString();
    }
    return date.toISOString();
  });

  // 4. Filtre pour tronquer le texte
  eleventyConfig.addFilter("truncate", function(str, length) {
    if (!str || str.length <= length) return str;
    return str.substring(0, length).trim() + '...';
  });

  // 5. Filtre pour ajouter le pathPrefix
  eleventyConfig.addFilter("relativeUrl", function(url) {
    const cleanUrl = url.startsWith('/') ? url : '/' + url;
    if (PATH_PREFIX && PATH_PREFIX !== '') {
      const prefix = PATH_PREFIX.endsWith('/') ? PATH_PREFIX.slice(0, -1) : PATH_PREFIX;
      return prefix + cleanUrl;
    }
    return cleanUrl;
  });

  // 6. Filtre pour normaliser les URLs canoniques
  eleventyConfig.addFilter("canonicalUrl", function(url) {
    if (!url) return '/';
    let cleanUrl = url.startsWith('/') ? url : '/' + url;
    cleanUrl = cleanUrl.replace(/\/index\.html$/, '/');
    if (cleanUrl !== '/' && !cleanUrl.match(/\.[a-z0-9]+$/i) && !cleanUrl.endsWith('/')) {
      cleanUrl = cleanUrl + '/';
    }
    return cleanUrl;
  });

  // 7. Filtre pour construire l'URL complète de l'image OG
  eleventyConfig.addFilter("buildOgImageUrl", function(imagePath) {
    if (!imagePath) imagePath = 'assets/img/logo-cc.jpg';
    if (imagePath.startsWith('http')) return imagePath;
    if (imagePath.startsWith('/')) return 'https://candc.ch' + imagePath;
    return 'https://candc.ch/' + imagePath;
  });

  // 8. Shortcode pour générer les schémas Schema.org en JSON-LD (LocalBusiness)
  eleventyConfig.addShortcode("schemaOrg", function(page, locale) {
    const baseUrl = 'https://candc.ch';
    const schemas = [];
    
    // Charger les traductions
    let translations = {};
    try {
      const translationsPath = path.join(__dirname, 'src', '_data', 'translations.json');
      if (fs.existsSync(translationsPath)) {
        translations = JSON.parse(fs.readFileSync(translationsPath, 'utf8'));
      }
    } catch (e) {
      console.error('Error loading translations:', e);
    }
    
    const t = translations[locale] || translations['fr'] || {};
    
    // Schema LocalBusiness
    const localBusiness = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "name": t.businessName || "C & C",
      "url": baseUrl + (page.url || '/'),
      "logo": `${baseUrl}/assets/img/logo-cc.jpg`,
      "description": t.businessDescription || "Eco Studio et Parking à La Sonnaz, Fribourg",
      "address": {
        "@type": "PostalAddress",
        "addressCountry": "CH",
        "addressLocality": "La Sonnaz",
        "addressRegion": "Fribourg",
        "postalCode": "1782",
        "streetAddress": t.streetAddress || "La Sonnaz"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": "46.8250",
        "longitude": "7.1030"
      },
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "Customer Service",
        "email": "bonjour@candc.ch",
        "availableLanguage": ["French", "English", "German", "Spanish", "Portuguese"]
      },
      "areaServed": {
        "@type": "City",
        "name": "Fribourg"
      },
      "priceRange": "$$"
    };
    schemas.push(localBusiness);
    
    // Générer le JSON-LD
    return schemas.map(schema => 
      `<script type="application/ld+json">${JSON.stringify(schema, null, 2)}</script>`
    ).join('\n');
  });

  // 9. Minification HTML
  eleventyConfig.addTransform("htmlmin", function(content, outputPath) {
    if (process.env.ELEVENTY_ENV === 'prod' && outputPath && outputPath.endsWith(".html")) {
      return htmlmin.minify(content, {
        removeComments: true,
        collapseWhitespace: true,
        minifyCSS: true,
        minifyJS: true,
      });
    }
    return content;
  });

  // 10. Copie des assets statiques
  eleventyConfig.addPassthroughCopy({ "src/assets/img": "assets/img" });
  eleventyConfig.addPassthroughCopy({ "src/assets/js": "assets/js" });
  eleventyConfig.addPassthroughCopy("src/robots.txt");
  eleventyConfig.addPassthroughCopy("src/_redirects");
  eleventyConfig.addPassthroughCopy({ "src/favicon.ico": "favicon.ico" });
  eleventyConfig.addPassthroughCopy("netlify.toml");
  
  // 11. Support XML pour sitemap
  eleventyConfig.setTemplateFormats(["html", "md", "njk", "xml"]);
  
  return {
    dir: { input: "src", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    xmlTemplateEngine: "njk",
    pathPrefix: PATH_PREFIX !== undefined ? PATH_PREFIX : ""
  };
};
