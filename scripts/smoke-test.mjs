// Teste de fumaça no navegador (Chromium via Playwright). Requer `npm run build` antes.
// Sobe o `vite preview`, entra no modo offline, abre o jogo com ?test e verifica: carregamento na cidade, escala
// inteira, movimento, diagonal, colisão com prédio e borda, aviso da porta, ida e volta da Gruta gerada por seed
// e Gruta nova a cada entrada, coleta de recursos e inventário, combate e derrota (modo offline). Uso: npm run smoke
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
  await page.getByRole('button', { name: 'Jogar offline: Mago' }).click({ timeout: 10000 });
  await page.waitForFunction(() => window.__navor?.ready, null, { timeout: 15000 });
  await page.click('canvas');
  const p = () => page.evaluate(() => window.__navor.player());
  const nav = (fn, arg) => page.evaluate(fn, arg);
  const hold = async (keys, ms) => {
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(ms);
    for (const k of keys) await page.keyboard.up(k);
    await page.waitForTimeout(100);
  };
  const cellOf = (pos, T) => ({ x: Math.floor(pos.x / T), y: Math.floor(pos.y / T) });
  const waitForMap = (id) =>
    page.waitForFunction((m) => window.__navor?.mapId === m, id, { timeout: 5000 }).then(() => page.waitForTimeout(400));

  check('jogo carrega sem erros no console', errors.length === 0, errors.join(' | '));
  const zoom = await nav(() => window.__navor.zoom());
  check('escala inteira em 1920x1080', zoom === 3, `zoom ${zoom}`);
  check('começa na cidade', (await nav(() => window.__navor.mapId)) === 'city');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'cidade-inicio.png') });

  const T = await nav(() => window.__navor.tileSize);
  const start = await p();
  const spawn = await nav(() => window.__navor.spawn);
  const startCell = cellOf(start, T);
  check('nasce no ponto P da praça', startCell.x === spawn.x && startCell.y === spawn.y, JSON.stringify(startCell));

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

  // Prédio: em frente à porta do Mercado, andar para cima para na base do prédio e mostra o aviso
  const market = (await nav(() => window.__navor.doors)).find((d) => d.id === 'market');
  await nav(([x, y]) => window.__navor.teleport(x, y), [market.approach.x, market.approach.y + 1]);
  await hold(['ArrowUp'], 1500);
  const atDoor = await p();
  check('não atravessa o prédio', atDoor.bottom - 12 >= market.y + 6 - 1, `topo dos pés ${Math.round(atDoor.bottom - 12)}`);
  const msg = await nav(() => window.__navor.doorMessage());
  check('mostra o aviso na porta do Mercado', msg === 'Mercado: em breve', String(msg));
  await page.screenshot({ path: join(OUT, 'cidade-porta.png') });

  // Muro da cidade: da beira oeste, segura a seta para a esquerda; para no arbusto da borda
  await nav(() => window.__navor.teleport(2, 16));
  await hold(['ArrowLeft'], 1500);
  const atBorder = await p();
  check('para na borda da cidade (não atravessa)', atBorder.x > T && atBorder.x < T * 2, `x ${Math.round(atBorder.x)}`);
  const blockedHere = await page.evaluate(({ x, y }) => window.__navor.isBlockedAt(x, y), atBorder);
  check('nunca fica dentro de célula bloqueada', !blockedHere);

  // Portão sul da cidade -> Gruta gerada por seed
  await nav(() => window.__navor.teleport(19, 27));
  await hold(['ArrowDown'], 900);
  await waitForMap('cave').catch(() => {});
  check('o portão leva à Gruta', (await nav(() => window.__navor.mapId)) === 'cave');
  const caveSeed = await nav(() => window.__navor.seed);
  check('a Gruta tem seed', Number.isInteger(caveSeed), String(caveSeed));
  const caveSpawn = await nav(() => window.__navor.spawn);
  const inCave = cellOf(await p(), T);
  check('chega na entrada da Gruta', inCave.x === caveSpawn.x && inCave.y === caveSpawn.y, JSON.stringify(inCave));
  const rowsBefore = await nav(() => window.__navor.rows);
  await hold(['ArrowDown'], 800);
  check('a Gruta não muda enquanto o jogador está dentro', JSON.stringify(await nav(() => window.__navor.rows)) === JSON.stringify(rowsBefore));
  await page.screenshot({ path: join(OUT, 'gruta.png') });

  // Pontos de coleta e inventário (no modo offline o sorteio roda no navegador e nada é salvo)
  const nodes = await nav(() => window.__navor.nodes());
  check('a Gruta tem de 8 a 12 pontos de coleta', nodes.length >= 8 && nodes.length <= 12, String(nodes.length));
  const first = nodes[0];
  await nav(([x, y]) => window.__navor.teleport(x, y), [first.x, first.y]);
  await page.waitForTimeout(200);
  const prompt = await nav(() => window.__navor.collectPrompt());
  check('perto do ponto aparece "E: coletar"', /^E: coletar /.test(prompt ?? ''), String(prompt));
  await page.screenshot({ path: join(OUT, 'gruta-coleta.png') });
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  const afterCollect = await nav(() => ({ node: window.__navor.nodes()[0], inv: window.__navor.inventory() }));
  check('o ponto some depois da coleta', afterCollect.node.state === 'done');
  check('o item entra no inventário com a quantidade do ponto', afterCollect.inv[first.itemId] === first.quantity, JSON.stringify(afterCollect.inv));
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  check('apertar E de novo não duplica o item', (await nav(() => window.__navor.inventory()))[first.itemId] === first.quantity);
  await page.keyboard.press('i');
  await page.waitForTimeout(200);
  check('a tecla I abre o inventário', await nav(() => window.__navor.inventoryOpen()));
  await page.screenshot({ path: join(OUT, 'inventario.png') });
  await page.keyboard.press('i');
  await page.waitForTimeout(200);
  check('a tecla I fecha o inventário', !(await nav(() => window.__navor.inventoryOpen())));

  // Sai pela saída de baixo e volta ao portão da cidade
  const caveExit = (await nav(() => window.__navor.exits))[1];
  await nav(([x, y]) => window.__navor.teleport(x, y), [caveExit.x, caveExit.y - 2]);
  await hold(['ArrowDown'], 900);
  await waitForMap('city').catch(() => {});
  check('a saída da Gruta volta para a cidade', (await nav(() => window.__navor.mapId)) === 'city');
  const back = cellOf(await p(), T);
  check('volta no portão da cidade', back.x === 19 && back.y === 27, JSON.stringify(back));

  // Entrar de novo gera outra Gruta (decisão de 2026-10-27: Gruta nova a cada entrada)
  await nav(() => window.__navor.teleport(19, 27));
  await hold(['ArrowDown'], 900);
  await waitForMap('cave').catch(() => {});
  const seed2 = await nav(() => window.__navor.seed);
  check('nova entrada gera outra Gruta', seed2 !== caveSeed, `${caveSeed} -> ${seed2}`);
  check('o inventário continua com o item depois de sair e entrar', (await nav(() => window.__navor.inventory()))[first.itemId] === first.quantity);
  check('a nova entrada traz pontos de coleta novos', (await nav(() => window.__navor.nodes())).every((n) => n.state === 'ready'));

  // Combate (Fase 6): monstros, Projétil Arcano, XP, cobre e morte
  const monsters = await nav(() => window.__navor.monsters());
  check('a Gruta tem de 4 a 6 monstros', monsters.length >= 4 && monsters.length <= 6, String(monsters.length));
  const full = await nav(() => window.__navor.vitals());
  check('entra na Gruta com vida e mana cheias', full.hp === full.maxHp && full.mana === full.maxMana, JSON.stringify(full));
  const target = monsters.find((m) => m.creatureId === 'cave-rat') ?? monsters[0];
  await nav(([x, y]) => window.__navor.teleport(x, y), [target.cell.x, target.cell.y]);
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  check('atacar gasta mana', (await nav(() => window.__navor.vitals())).mana < full.maxMana);
  await page.screenshot({ path: join(OUT, 'gruta-combate.png') });
  for (let i = 0; i < 40; i++) {
    const m = (await nav(() => window.__navor.monsters())).find((x) => x.index === target.index);
    if (m.state !== 'alive') break;
    await nav(([x, y]) => window.__navor.teleport(x, y), [m.cell.x, m.cell.y]);
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(500);
  const killed = (await nav(() => window.__navor.monsters())).find((x) => x.index === target.index);
  check('o Projétil Arcano abate o monstro', killed.state === 'dead', `${killed.state}, vida ${killed.hp}`);
  const progress = await nav(() => window.__navor.progress());
  const xpByCreature = { 'cave-rat': 8, 'goblin-raider': 22 };
  check('o abate dá o XP do monstro', progress.xp === xpByCreature[target.creatureId], JSON.stringify(progress));
  check('levar dano dos monstros não passa da vida máxima', (await nav(() => window.__navor.vitals())).hp <= full.maxHp);
  await nav(() => window.__navor.hurtPlayer(9999));
  check('vida zerada derruba o jogador', await nav(() => window.__navor.dead()));
  await page.waitForTimeout(500);
  check('mostra a mensagem de derrota', /derrotado/.test((await nav(() => window.__navor.notice())) ?? ''));
  await waitForMap('city').catch(() => {});
  check('depois da derrota, volta para a cidade', (await nav(() => window.__navor.mapId)) === 'city');
  const revived = await nav(() => window.__navor.vitals());
  check('volta com vida cheia', revived.hp === revived.maxHp, JSON.stringify(revived));
  check('a derrota não tira XP nem itens', (await nav(() => window.__navor.progress())).xp === progress.xp
    && (await nav(() => window.__navor.inventory()))[first.itemId] >= first.quantity);

  await page.keyboard.press('F3');
  await page.waitForTimeout(200);
  check('F3 liga a depuração', await page.evaluate(() => window.__navor.debugEnabled()));
  await page.screenshot({ path: join(OUT, 'cidade-depuracao.png') });

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(300);
  const zoomSmall = await page.evaluate(() => window.__navor.zoom());
  check('reajusta escala inteira em 1366x768', zoomSmall === 2, `zoom ${zoomSmall}`);

  // Guerreiro (golpe corpo a corpo) e Arqueiro (flecha): cada um abate um monstro na Gruta
  for (const [name, classId, hp] of [['Guerreiro', 'warrior', 90], ['Arqueiro', 'archer', 70]]) {
    const pg = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    pg.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    pg.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
    await pg.goto(URL);
    await pg.getByRole('button', { name: `Jogar offline: ${name}` }).click({ timeout: 10000 });
    await pg.waitForFunction(() => window.__navor?.ready, null, { timeout: 15000 });
    await pg.click('canvas');
    const ev = (fn, arg) => pg.evaluate(fn, arg);
    check(`${name}: usa a arte da classe`, (await ev(() => window.__navor.player().texture)).startsWith(`character:${classId}:`));
    check(`${name}: vida inicial ${hp}`, (await ev(() => window.__navor.vitals())).maxHp === hp);
    await ev(() => window.__navor.teleport(19, 27));
    await pg.keyboard.down('ArrowDown');
    await pg.waitForTimeout(900);
    await pg.keyboard.up('ArrowDown');
    await pg.waitForFunction(() => window.__navor?.mapId === 'cave', null, { timeout: 5000 });
    await pg.waitForTimeout(400);
    const target = (await ev(() => window.__navor.monsters()))[0];
    const mana0 = (await ev(() => window.__navor.vitals())).mana;
    for (let i = 0; i < 60; i++) {
      const m = (await ev(() => window.__navor.monsters())).find((x) => x.index === target.index);
      if (m.state !== 'alive') break;
      await ev(([x, y]) => window.__navor.teleport(x, y), [m.cell.x, m.cell.y]);
      await pg.keyboard.press('Space');
      await pg.waitForTimeout(600);
      // repõe a vida para o teste não depender da sorte nos golpes do monstro
      await ev(() => window.__navor.heal());
    }
    await pg.waitForTimeout(500);
    const dead = (await ev(() => window.__navor.monsters())).find((x) => x.index === target.index);
    check(`${name}: o ataque básico abate o monstro`, dead.state === 'dead', `${dead.state}, vida ${dead.hp}`);
    check(`${name}: o ataque básico não gasta mana`, (await ev(() => window.__navor.vitals())).mana >= mana0);
    check(`${name}: o abate dá XP`, (await ev(() => window.__navor.progress())).xp > 0);
    await pg.screenshot({ path: join(OUT, `gruta-${classId}.png`) });
    await pg.close();
  }

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
