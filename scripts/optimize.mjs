#!/usr/bin/env node
/**
 * Pipeline de Otimização de Imagens (sharp) — GTA VI Landing Page
 * Converte imagens-fonte em AVIF e WebP nas larguras 480, 960, 1600 e 2560px,
 * além de gerar placeholders blur base64 em assets/placeholders.json.
 *
 * Uso:
 *   npm i -D sharp
 *   node scripts/optimize.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ASSETS_DIR = path.resolve(process.cwd(), 'assets');
const WIDTHS = [480, 960, 1600, 2560];
const TARGET_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);

async function optimizeAll() {
  const entries = await fs.readdir(ASSETS_DIR);
  const placeholders = {};

  for (const file of entries) {
    // Ignora variantes já redimensionadas (-480, -960, etc.) e ícones pequenos
    if (/-(480|960|1200|1080|1600|2560)\.(avif|webp)$/i.test(file)) continue;
    if (/^(icon-\d+|favicon|og-image)\./i.test(file)) continue;

    const ext = path.extname(file).toLowerCase();
    if (!TARGET_EXTS.has(ext)) continue;

    const fullPath = path.join(ASSETS_DIR, file);
    const baseName = path.basename(file, ext);
    const img = sharp(fullPath);
    const meta = await img.metadata();

    // Gera placeholder blur 24px em WebP Base64
    const blurBuf = await img
      .clone()
      .resize(24)
      .blur(1.5)
      .webp({ quality: 45 })
      .toBuffer();
    placeholders[file] = `data:image/webp;base64,${blurBuf.toString('base64')}`;

    // Mantém PNGs com transparência (hero-skyline.png, hero-palms.png) otimizados
    if (ext === '.png') {
      await img.clone().png({ quality: 85, compressionLevel: 9 }).toFile(fullPath + '.opt');
      await fs.rename(fullPath + '.opt', fullPath);
      continue;
    }

    const outFormat = ext === '.webp' ? 'webp' : 'avif';
    for (const w of WIDTHS) {
      if (meta.width && w <= meta.width) {
        const outVariant = path.join(ASSETS_DIR, `${baseName}-${w}.${outFormat}`);
        await img
          .clone()
          .resize({ width: w, withoutEnlargement: true })
          [outFormat]({ quality: 80 })
          .toFile(outVariant);
      }
    }
    console.log(`[OK] ${file} -> srcset (${WIDTHS.join('/')}) + blur base64`);
  }

  await fs.writeFile(
    path.join(ASSETS_DIR, 'placeholders.json'),
    JSON.stringify(placeholders, null, 2),
    'utf8'
  );
  console.log('Pipeline sharp concluído com sucesso.');
}

optimizeAll().catch(err => {
  console.error('Erro no pipeline sharp:', err);
  process.exit(1);
});
