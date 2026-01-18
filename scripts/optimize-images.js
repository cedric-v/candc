const Image = require("@11ty/eleventy-img");
const fs = require("fs");
const path = require("path");

// Configuration des dossiers
const srcDir = path.join(__dirname, "..", "src", "assets", "img");
const outputDir = path.join(__dirname, "..", "_site", "assets", "img");

async function optimizeImage(imagePath, outputPath, options = {}) {
  try {
    const metadata = await Image(imagePath, {
      widths: options.widths || [300, 600, 900, 1200],
      formats: ["webp", "jpeg"],
      outputDir: path.dirname(outputPath),
      filenameFormat: function (id, src, width, format, options) {
        const extension = path.extname(src);
        const name = path.basename(src, extension);
        return `${name}-${width}w.${format}`;
      },
      sharpOptions: {
        quality: options.quality || 85,
        progressive: true,
        smartSubsample: true,
      },
      ...options
    });

    console.log(`✓ Optimized: ${path.basename(imagePath)}`);
    return metadata;
  } catch (error) {
    console.error(`✗ Error optimizing ${imagePath}:`, error.message);
    return null;
  }
}

async function optimizeAllImages() {
  console.log("🚀 Starting image optimization...");

  // Crée les dossiers de sortie si nécessaire
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Trouve toutes les images dans src/assets/img
  function findImages(dirPath, results = []) {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        findImages(fullPath, results);
      } else if (stat.isFile()) {
        const ext = path.extname(item).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
          results.push(fullPath);
        }
      }
    }

    return results;
  }

  const imageFiles = findImages(srcDir);
  let totalImages = imageFiles.length;
  let processedImages = 0;

  for (const imagePath of imageFiles) {
    // Détermine les options selon le type d'image
    let options = {};

    if (imagePath.includes('testimonials')) {
      // Images de témoignages : optimisées pour la grille
      options = {
        widths: [400, 600, 800],
        quality: 90
      };
    } else if (imagePath.includes('about-background')) {
      // Image hero : grande taille
      options = {
        widths: [1200, 1600, 1920],
        quality: 85
      };
    } else if (imagePath.includes('logo')) {
      // Logos : petite taille
      options = {
        widths: [100, 200, 300],
        quality: 95
      };
    } else {
      // Images par défaut
      options = {
        widths: [300, 600, 900, 1200],
        quality: 85
      };
    }

    // Calcule le chemin de sortie relatif
    const relativePath = path.relative(srcDir, imagePath);
    const outputPath = path.join(outputDir, relativePath);

    const result = await optimizeImage(imagePath, outputPath, options);
    if (result) {
      processedImages++;
    }
  }

  console.log(`\n✅ Optimization complete!`);
  console.log(`📊 ${processedImages}/${totalImages} images processed successfully`);

  // Affiche les économies réalisées
  const srcSize = getDirectorySize(srcDir);
  const outputSize = getDirectorySize(outputDir);

  if (srcSize > 0 && outputSize > 0) {
    const savings = ((srcSize - outputSize) / srcSize * 100).toFixed(1);
    console.log(`💾 Space savings: ${savings}% (${formatBytes(srcSize - outputSize)})`);
  }
}

function getDirectorySize(dirPath) {
  let totalSize = 0;

  function calculateSize(itemPath) {
    const stats = fs.statSync(itemPath);

    if (stats.isDirectory()) {
      const items = fs.readdirSync(itemPath);
      items.forEach(item => {
        calculateSize(path.join(itemPath, item));
      });
    } else {
      totalSize += stats.size;
    }
  }

  try {
    calculateSize(dirPath);
  } catch (error) {
    console.warn(`Could not calculate size for ${dirPath}:`, error.message);
  }

  return totalSize;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Vérifie si le script est appelé directement
if (require.main === module) {
  optimizeAllImages().catch(console.error);
}

module.exports = { optimizeAllImages, optimizeImage };