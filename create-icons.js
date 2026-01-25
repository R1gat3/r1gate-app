const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="48" fill="#00C853"/>
  <circle cx="77" cy="90" r="26" fill="#0D0D0D"/>
  <circle cx="179" cy="90" r="26" fill="#0D0D0D"/>
  <circle cx="128" cy="179" r="26" fill="#0D0D0D"/>
  <line x1="77" y1="90" x2="179" y2="90" stroke="#0D0D0D" stroke-width="10"/>
  <line x1="77" y1="90" x2="128" y2="179" stroke="#0D0D0D" stroke-width="10"/>
  <line x1="179" y1="90" x2="128" y2="179" stroke="#0D0D0D" stroke-width="10"/>
</svg>`;

async function createIcons() {
  const svgBuffer = Buffer.from(svgContent);

  // Create PNG 256x256
  await sharp(svgBuffer)
    .resize(256, 256)
    .png()
    .toFile(path.join(__dirname, 'icon.png'));
  console.log('Created icon.png (256x256)');

  // Create PNG 512x512 for better quality
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(__dirname, 'icon-512.png'));
  console.log('Created icon-512.png (512x512)');

  // For ICO, we need multiple sizes
  const sizes = [16, 32, 48, 64, 128, 256];
  const icoImages = [];

  for (const size of sizes) {
    const buffer = await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toBuffer();
    icoImages.push({ size, buffer });
  }

  // Create a simple ICO file (Windows uses PNG inside ICO for sizes > 32)
  // For simplicity, we'll just use the 256x256 PNG and electron-builder will handle it
  console.log('Icons created successfully!');
}

createIcons().catch(console.error);
