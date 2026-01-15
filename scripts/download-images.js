#!/usr/bin/env node

/**
 * Script pour télécharger les images depuis les sites sources Google Sites
 * 
 * Instructions :
 * 1. Visiter manuellement les sites sources
 * 2. Ouvrir les images en haute résolution
 * 3. Utiliser ce script pour les télécharger
 * 
 * OU utiliser un outil comme wget ou curl pour télécharger directement
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const IMAGES_DIR = path.join(__dirname, '..', 'src', 'assets', 'img');

// Créer le dossier si nécessaire
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// Liste des URLs d'images à télécharger (à remplir manuellement après avoir identifié les URLs)
const imagesToDownload = [
  // Exemple - à remplacer par les vraies URLs
  // {
  //   url: 'https://sites.google.com/view/cc-eco-studio/.../image.jpg',
  //   filename: 'studio-exterieur.jpg'
  // }
];

function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(IMAGES_DIR, filename);
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode === 200) {
        const fileStream = fs.createWriteStream(filePath);
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`✓ Téléchargé: ${filename}`);
          resolve();
        });
      } else if (response.statusCode === 302 || response.statusCode === 301) {
        // Suivre les redirections
        downloadImage(response.headers.location, filename)
          .then(resolve)
          .catch(reject);
      } else {
        reject(new Error(`Erreur ${response.statusCode} pour ${url}`));
      }
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  console.log('📥 Téléchargement des images...\n');
  
  if (imagesToDownload.length === 0) {
    console.log('⚠️  Aucune image à télécharger.');
    console.log('📝 Veuillez d\'abord identifier les URLs des images sur les sites sources et les ajouter dans ce script.\n');
    console.log('Sites sources:');
    console.log('  - Eco Studio: https://sites.google.com/view/cc-eco-studio/galerie-gallery');
    console.log('  - Parking: https://sites.google.com/view/cc-parking-space/galerie-gallery\n');
    return;
  }
  
  for (const image of imagesToDownload) {
    try {
      await downloadImage(image.url, image.filename);
    } catch (error) {
      console.error(`✗ Erreur pour ${image.filename}:`, error.message);
    }
  }
  
  console.log('\n✅ Téléchargement terminé!');
}

main();
