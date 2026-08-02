#!/usr/bin/env node
/**
 * optimize-images.js
 *
 * Pre-optimizes the source images committed in src/assets/img so that:
 *  - the Eleventy responsive pipeline (eleventy-img) works from smaller sources
 *  - the plain <img> fallback (used when sharp cannot load at build time,
 *    e.g. wrong Node version on Cloudflare Pages) no longer serves multi-MB files
 *
 * Rules:
 *  - hero images (fond-hero-*): resize to 2000px wide, JPEG q82 progressive
 *  - about-background.jpg:      resize to 1920px wide, JPEG q80 progressive
 *  - logo-cc.jpg:               keep 573px (used as OG image), JPEG q80
 *  - superhost badge PNG:       keep 654px (has alpha), PNG palette (256 colors), level 9
 *  - gallery/*:                 resize to 1200px wide max, JPEG q80 progressive
 *  - testimonials/*:            resize to 1200px wide max, JPEG q80 progressive
 *  - anything else:             recompress JPEG q80 / PNG palette level 9, no resize
 *
 * Usage: node scripts/optimize-images.js
 */

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "src", "assets", "img");

const JPEG_TARGETS = [
  { glob: "fond-hero-*.jpg", maxWidth: 2000, quality: 82 },
  { glob: "about-background.jpg", maxWidth: 1920, quality: 80 },
  { glob: "logo-cc.jpg", maxWidth: 573, quality: 80 },
  { glob: "gallery/**/*.jpg", maxWidth: 1200, quality: 80 },
  { glob: "testimonials/**/*.jpg", maxWidth: 1200, quality: 80 },
];

const JPEG_GENERIC_QUALITY = 80;
const PNG_GENERIC_LEVEL = 9;
const SKIP_IF_UNDER_KB = 90; // only rewrite jpegs below this size if resize needed

function globToPaths(pattern) {
  // A leading "**/" must also match top-level files (zero directories).
  const variants = pattern.startsWith("**/") ? [pattern, pattern.slice(3)] : [pattern];
  const out = [];
  for (const pat of variants) {
    const re = new RegExp(
      "^" + pat.replace(/\./g, "\\.").replace(/\*\*/g, "__DS__").replace(/\*/g, "[^/]*").replace(/__DS__/g, ".*") + "$"
    );
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else {
          const rel = path.relative(ROOT, full).split(path.sep).join("/");
          if (re.test(rel)) out.push(full);
        }
      }
    };
    walk(ROOT);
  }
  return [...new Set(out)];
}

async function optimizeJpeg(file, maxWidth, quality) {
  const before = fs.statSync(file).size;
  const meta = await sharp(file).metadata();
  const resizeNeeded = meta.width > maxWidth;
  let s = sharp(file);
  if (resizeNeeded) s = s.resize({ width: maxWidth, withoutEnlargement: true });
  const buf = await s
    .jpeg({ quality, mozjpeg: true, progressive: true, chromaSubsampling: "4:2:0" })
    .toBuffer();
  if (!resizeNeeded && before < SKIP_IF_UNDER_KB * 1024 && buf.length >= before) {
    return { file, action: "skip (already small)" };
  }
  if (buf.length >= before && !resizeNeeded) {
    return { file, action: `skip (recompression not smaller: ${fmt(before)} -> ${fmt(buf.length)})` };
  }
  // Avoid churn on re-runs: skip negligible gains (< 2 % or < 2 KiB) when no resize is needed.
  if (!resizeNeeded && before - buf.length < Math.max(2048, before * 0.02)) {
    return { file, action: `skip (gain negligible: ${fmt(before)} -> ${fmt(buf.length)})` };
  }
  await fs.promises.writeFile(file, buf);
  return { file, action: `${fmt(before)} -> ${fmt(buf.length)} (${maxWidth}px max, q${quality})` };
}

async function optimizePng(file) {
  const before = fs.statSync(file).size;
  const buf = await sharp(file)
    .png({ compressionLevel: PNG_GENERIC_LEVEL, adaptiveFiltering: true, palette: true, colors: 256 })
    .toBuffer();
  if (buf.length >= before) {
    return { file, action: `skip (PNG not smaller: ${fmt(before)} -> ${fmt(buf.length)})` };
  }
  await fs.promises.writeFile(file, buf);
  return { file, action: `${fmt(before)} -> ${fmt(buf.length)} (PNG palette, level ${PNG_GENERIC_LEVEL})` };
}

function fmt(bytes) {
  return `${(bytes / 1024).toFixed(0)} KiB`;
}

async function main() {
  const results = [];
  const seen = new Set();

  // 1. Specific JPEG targets (resize + recompress)
  for (const t of JPEG_TARGETS) {
    for (const file of globToPaths(t.glob)) {
      seen.add(file);
      results.push(await optimizeJpeg(file, t.maxWidth, t.quality));
    }
  }

  // 2. All remaining jpeg/jpg sources (recompress only)
  const allJpegs = globToPaths("**/*.{jpg,jpeg}");
  for (const file of allJpegs) {
    if (seen.has(file)) continue;
    seen.add(file);
    const meta = await sharp(file).metadata();
    results.push(await optimizeJpeg(file, meta.width, JPEG_GENERIC_QUALITY));
  }

  // 3. PNG sources (recompress, keep alpha)
  for (const file of globToPaths("**/*.png")) {
    results.push(await optimizePng(file));
  }

  for (const r of results.sort((a, b) => a.file.localeCompare(b.file))) {
    console.log(`${r.action.padEnd(58)} ${path.relative(ROOT, r.file)}`);
  }
  const total = results.length;
  console.log(`\n${total} image(s) traitées.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
