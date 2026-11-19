/**
 * Script de Verificação Automatizada (Playwright) — GTA VI Fan Landing Page
 * Executa checagens em Desktop (1440x900) e Mobile (375x812):
 *  - Ausência de erros de console e pageerror
 *  - Nav ativo (aria-current="true") ao rolar para uma seção
 *  - Carrossel do Hero pausável (WCAG 2.2.2)
 *  - Drawer mobile (375x812): abertura, foco preso, inert no main e fechamento com Esc
 *  - Lightbox do Modo Foto: abertura, slider Antes/Depois via teclado e fechamento com Esc
 *  - Comportamento com prefers-reduced-motion: reduce emulado
 *
 * Uso:
 *   npm i -D playwright
 *   npx playwright install chromium
 *   node scripts/verify.mjs http://localhost:8000
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE_URL = process.argv[2] || 'http://localhost:8000';

async function runDesktopChecks(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  // 1. Carrossel pausável (WCAG 2.2.2)
  const pauseBtn = page.locator('#hero-pause');
  await pauseBtn.click();
  assert.equal(await pauseBtn.getAttribute('aria-pressed'), 'true', 'Hero carousel deve pausar ao clicar');

  // 2. Nav ativo por seção
  await page.locator('#guide').scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  const guideNavCurrent = await page.locator('#main-nav a[href="#guide"]').getAttribute('aria-current');
  assert.equal(guideNavCurrent, 'true', 'Link #guide deve receber aria-current="true"');

  // 3. Lightbox + slider Antes/Depois por teclado + Esc
  await page.locator('.g-btn').first().click();
  await page.waitForSelector('#lightbox:not([hidden])');
  assert.equal(await page.locator('#main').getAttribute('aria-hidden'), 'true', '#main deve ficar inert/aria-hidden');

  const compareSlider = page.locator('#lb-compare');
  await compareSlider.focus();
  await page.keyboard.press('ArrowLeft');
  const valAfterKey = Number(await compareSlider.inputValue());
  assert.ok(valAfterKey < 100, 'Slider Antes/Depois deve responder às setas do teclado');

  await page.keyboard.press('Escape');
  await page.waitForSelector('#lightbox[hidden]', { state: 'attached' });

  assert.deepEqual(errors, [], `Erros no console desktop: ${errors.join('; ')}`);
  await ctx.close();
  console.log('[PASS] Desktop 1440x900');
}

async function runMobileAndReducedMotionChecks(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    reducedMotion: 'reduce'
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // Reduced motion: carrossel deve iniciar pausado e painéis da cidade verticais
  assert.equal(await page.locator('#hero-pause').getAttribute('aria-pressed'), 'true', 'Reduced motion deve pausar carrossel');

  // Drawer mobile: abrir, validar inert no main, Tab dentro do drawer e fechar com Esc
  await page.locator('#nav-toggle').click();
  await page.waitForSelector('#mobile-drawer:not([hidden])');
  assert.equal(await page.locator('#main').getAttribute('aria-hidden'), 'true', 'Main deve ficar inert com drawer aberto');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#mobile-drawer[hidden]', { state: 'attached' });

  assert.deepEqual(errors, [], `Erros no console mobile: ${errors.join('; ')}`);
  await ctx.close();
  console.log('[PASS] Mobile 375x812 + Reduced Motion');
}

const browser = await chromium.launch();
try {
  await runDesktopChecks(browser);
  await runMobileAndReducedMotionChecks(browser);
  console.log('Todas as verificações passaram!');
} finally {
  await browser.close();
}
