// Teste de fumaça no navegador (Chromium via Playwright). Requer `npm run build` antes.
// Sobe o `vite preview`, entra no modo offline, abre o jogo com ?test e verifica: carregamento, escala inteira,
// movimento, normalização da diagonal e colisão com o muro. Uso: npm run smoke
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { preview } from 'vite';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright não encontrado. Instale com: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const PORT = 4173;
const URL = `http://localhost:${PORT}/?test`;
const OUT = join(import.meta.dirname, '..', 'test-results');
mkdirSync(OUT, { recursive: true });

const WEB = join(import.meta.dirname, '..', 'apps', 'web');
let server;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'OK  ' : 'FALHA'} ${name}${detail ? ` — ${detail}` : ''}`);
};

try {
  // Servidor de preview do Vite no mesmo processo (encerra junto com o teste).
  server = await preview({ root: WEB, preview: { port: PORT, strictPort: true }, logLevel: 'warn' });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(URL);
  // Sem backend configurado no build, o menu oferece o modo offline.
  await page.getByRole('button', { name: /Jogar offline/ }).click({ timeout: 10000 });
  await page.waitForFunction(() => window.__navor?.ready, null, { timeout: 15000 });
  await page.click('canvas');
  const p = () => page.evaluate(() => window.__navor.player());
  const hold = async (keys, ms) => {
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(ms);
    for (const k of keys) await page.keyboard.up(k);
    await page.waitForTimeout(100);
  };

  check('jogo carrega sem erros no console', errors.length === 0, errors.join(' | '));
  const zoom = await page.evaluate(() => window.__navor.zoom());
  check('escala inteira em 1920x1080', zoom === 3, `zoom ${zoom}`);
  await page.screenshot({ path: join(OUT, 'fase1-inicio.png') });

  const start = await p();
  const spawn = await page.evaluate(() => window.__navor.spawn);
  const T = await page.evaluate(() => window.__navor.tileSize);
  check('nasce no ponto P do mapa', Math.floor(start.x / T) === spawn.x && Math.floor(start.y / T) === spawn.y);

  await hold(['ArrowLeft'], 500);
  const afterLeft = await p();
  check('anda para a esquerda com a seta', afterLeft.x < start.x - 20, `dx ${Math.round(afterLeft.x - start.x)}`);
  check('vira para a esquerda (west)', afterLeft.facing === 'west');
  check('usa a arte real do Mago', afterLeft.texture === 'character:mage:west', afterLeft.texture);

  // 4 tiles/s = 128 px/s: em 500 ms deve andar ~64 px (tolerância para o tempo do navegador)
  const dx = start.x - afterLeft.x;
  check('velocidade perto de 128 px/s', dx > 45 && dx < 90, `${Math.round(dx)} px em 500 ms`);

  const beforeDiag = await p();
  await hold(['d', 's'], 500);
  const afterDiag = await p();
  const ddx = afterDiag.x - beforeDiag.x;
  const ddy = afterDiag.y - beforeDiag.y;
  const diag = Math.hypot(ddx, ddy);
  check('WASD funciona na diagonal', ddx > 10 && ddy > 10, `dx ${Math.round(ddx)} dy ${Math.round(ddy)}`);
  check('usa o sprite da diagonal (south-east)', afterDiag.facing === 'south-east', afterDiag.facing);
  check('diagonal não é mais rápida que linha reta', diag < dx * 1.15, `${Math.round(diag)} px vs ${Math.round(dx)} px`);

  // Sobe até o muro do topo: segura a seta para cima por 6 s
  await hold(['ArrowUp'], 6000);
  const atWall = await p();
  check('para no muro do topo (não atravessa)', atWall.y > T && atWall.y < T * 2 + 4, `y ${Math.round(atWall.y)}`);
  const solidHere = await page.evaluate(({ x, y }) => window.__navor.isSolidAt(x, y), atWall);
  check('nunca fica dentro de tile sólido', !solidHere);
  await page.screenshot({ path: join(OUT, 'fase1-muro.png') });

  await page.keyboard.press('F3');
  await page.waitForTimeout(200);
  check('F3 liga a depuração', await page.evaluate(() => window.__navor.debugEnabled()));
  await page.screenshot({ path: join(OUT, 'fase1-depuracao.png') });

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(300);
  const zoomSmall = await page.evaluate(() => window.__navor.zoom());
  check('reajusta escala inteira em 1366x768', zoomSmall === 2, `zoom ${zoomSmall}`);
  check('sem erros durante o teste', errors.length === 0, errors.join(' | '));

  await browser.close();
} catch (err) {
  check('execução do teste', false, err.message);
} finally {
  await server?.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram. Capturas em test-results/.`);
process.exit(failed ? 1 : 0);
