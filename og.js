const { createCanvas, registerFont, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');

const CACHE_DIR = path.join(__dirname, 'og-cache');
const MAX_CACHE_BYTES = 50 * 1024 * 1024; // 50MB

// Register fonts
registerFont(
  path.join(__dirname, 'node_modules/geist/dist/fonts/geist-mono/GeistMono-Bold.ttf'),
  { family: 'GeistMono', weight: 'bold' }
);
registerFont(
  path.join(__dirname, 'node_modules/geist/dist/fonts/geist-sans/Geist-SemiBold.ttf'),
  { family: 'GeistSans', weight: '600' }
);

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}

// Load logo once at startup — node-canvas requires width/height on SVG elements
let logoImage = null;
const logoPath = path.join(__dirname, 'public/images/logo.svg');
const logoSvg = fs.readFileSync(logoPath, 'utf8')
  .replace('<svg ', '<svg width="101" height="63" ');
const logoReady = loadImage(Buffer.from(logoSvg)).then(img => { logoImage = img; });

async function generateOGImage(code) {
  // Check disk cache
  const cachePath = path.join(CACHE_DIR, `${code}.png`);
  try {
    const cached = fs.readFileSync(cachePath);
    return cached;
  } catch (_) {
    // Not cached, generate
  }

  await logoReady;

  const width = 1200;
  const height = 630;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Gold background
  ctx.fillStyle = '#FFCC00';
  ctx.fillRect(0, 0, width, height);

  // Draw logo (bottom-left area, matching graph.png layout)
  // Logo SVG viewBox is 101x63, scale it up
  const logoScale = 3.2;
  const logoW = 101 * logoScale;
  const logoH = 63 * logoScale;
  const logoX = 100;
  const logoY = (height - logoH) / 2;
  ctx.drawImage(logoImage, logoX, logoY, logoW, logoH);

  // Draw "HYPERFRAME" and "COMPUTER" text (right side of logo)
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'middle';

  const textX = logoX + logoW + 60;
  const textCenterY = height / 2;

  ctx.font = '600 88px GeistSans';
  ctx.fillText('HYPERFRAME', textX, textCenterY - 55);
  ctx.fillText('COMPUTER', textX, textCenterY + 45);

  // Draw hyperframe code below in mono
  ctx.font = 'bold 42px GeistMono';
  ctx.fillStyle = '#000000';
  ctx.globalAlpha = 0.5;
  ctx.fillText(code, textX, textCenterY + 130);
  ctx.globalAlpha = 1.0;

  // Export PNG buffer
  const buffer = canvas.toBuffer('image/png');

  // Write to cache
  fs.writeFileSync(cachePath, buffer);
  enforceCacheLimit();

  return buffer;
}

function enforceCacheLimit() {
  try {
    const files = fs.readdirSync(CACHE_DIR)
      .map(name => {
        const filePath = path.join(CACHE_DIR, name);
        const stat = fs.statSync(filePath);
        return { name, path: filePath, size: stat.size, mtime: stat.mtimeMs };
      });

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize < MAX_CACHE_BYTES) return;

    // Sort by mtime ascending (oldest first)
    files.sort((a, b) => a.mtime - b.mtime);

    let currentSize = totalSize;
    for (const file of files) {
      if (currentSize < MAX_CACHE_BYTES) break;
      fs.unlinkSync(file.path);
      currentSize -= file.size;
    }
  } catch (_) {
    // Cache cleanup is best-effort
  }
}

module.exports = { generateOGImage };
