// Teste de fumaça no navegador (Chromium via Playwright). Requer `npm run build` antes.
// Sobe o `vite preview`, entra no modo offline, abre o jogo com ?test e verifica: carregamento na cidade, escala
// inteira, movimento, diagonal, colisão com prédio e borda, aviso da porta, ida e volta da Gruta gerada por seed
// e Gruta nova a cada entrada, coleta de recursos e inventário, combate e derrota, Floresta com animais e baús
// (modo offline). Uso: npm run smoke
import { mkdirSync, readFileSync } from 'node:fs';
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
const readContent = (file) => JSON.parse(readFileSync(join(import.meta.dirname, '..', 'content', file), 'utf8'));
const CREATURES = readContent('creatures.json').creatures;
const FOREST = readContent('procedural.json').areas.find((a) => a.id === 'forest');
const ITEMS = new Map(readContent('items.json').items.map((i) => [i.id, i]));
const GATHER_TIERS = readContent('equipment.json').gatherTiers;
/** depósito raro: só sai com picareta ou machado equipado (Fase 11) */
const needsTool = (itemId) => Boolean(ITEMS.get(itemId)?.gather && GATHER_TIERS[ITEMS.get(itemId).rarity]);
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
  // lê a direção ainda com as duas teclas apertadas: soltar uma antes da outra pode virar o boneco para o sul
  await page.keyboard.down('d');
  await page.keyboard.down('s');
  await page.waitForTimeout(500);
  const afterDiag = await p();
  await page.keyboard.up('d');
  await page.keyboard.up('s');
  await page.waitForTimeout(100);
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
  check('mostra o aviso na porta do Mercado', msg === 'Mercado (E: entrar)', String(msg));
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
  const gated = nodes.find((n) => needsTool(n.itemId));
  if (gated) {
    await nav(([x, y]) => window.__navor.teleport(x, y), [gated.x, gated.y]);
    await page.waitForTimeout(200);
    check('depósito raro sem picareta pede a ferramenta', /precisa de picareta/.test(await nav(() => window.__navor.collectPrompt()) ?? ''));
  }
  const first = nodes.find((n) => !needsTool(n.itemId));
  await nav(([x, y]) => window.__navor.teleport(x, y), [first.x, first.y]);
  await page.waitForTimeout(200);
  const prompt = await nav(() => window.__navor.collectPrompt());
  check('perto do ponto aparece "E: coletar"', /^E: coletar /.test(prompt ?? ''), String(prompt));
  await page.screenshot({ path: join(OUT, 'gruta-coleta.png') });
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  const afterCollect = await nav((i) => ({ node: window.__navor.nodes().find((n) => n.index === i), inv: window.__navor.inventory() }), first.index);
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
  check('entra na Gruta com a vida da cidade e mana cheia', full.hp > 0 && full.hp <= full.maxHp && full.mana === full.maxMana, JSON.stringify(full));
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
  const xpOf = (id) => CREATURES.find((c) => c.id === id).xp;
  check('o abate dá o XP do monstro', progress.xp === xpOf(target.creatureId), JSON.stringify(progress));
  check('levar dano dos monstros não passa da vida máxima', (await nav(() => window.__navor.vitals())).hp <= full.maxHp);
  await nav(() => window.__navor.hurtPlayer(9999));
  check('vida zerada derruba o jogador', await nav(() => window.__navor.dead()));
  await page.waitForTimeout(500);
  check('mostra a mensagem de derrota', /derrotado/.test((await nav(() => window.__navor.notice())) ?? ''));
  await waitForMap('city').catch(() => {});
  check('depois da derrota, volta para a cidade', (await nav(() => window.__navor.mapId)) === 'city');
  const revived = await nav(() => window.__navor.vitals());
  check('volta com metade da vida', revived.hp === Math.ceil(revived.maxHp / 2), JSON.stringify(revived));
  check('a derrota não tira XP nem itens', (await nav(() => window.__navor.progress())).xp === progress.xp
    && (await nav(() => window.__navor.inventory()))[first.itemId] >= first.quantity);

  // Economia (Fase 10): lojas dos NPCs, poção na tecla 1, dormitório e câmbio (modo offline)
  const doors = await nav(() => window.__navor.doors);
  const enter = async (id) => {
    const d = doors.find((x) => x.id === id);
    await nav(([x, y]) => window.__navor.teleport(x, y), [d.approach.x, d.approach.y + 1]);
    await hold(['ArrowUp'], 600);
    await page.keyboard.press('e');
    await page.waitForTimeout(200);
    return nav(() => window.__navor.panelOpen());
  };
  const wallet = async () => {
    const pr = await nav(() => window.__navor.progress());
    return { copper: pr.copper, gold: pr.gold };
  };
  const button = (name) => page.getByRole('button', { name });
  await nav(() => window.__navor.grant(300));
  const w0 = await wallet();
  check('E na porta do Alquimista abre a loja', await enter('alchemist'));
  check('a loja mostra o nome do NPC', await page.getByRole('heading', { name: 'Alquimista' }).isVisible());
  await button('Comprar 1: Poção de Vida Pequena').click();
  await page.waitForTimeout(200);
  await button('Comprar 1: Poção de Vida Pequena').click();
  await page.waitForTimeout(200);
  check('comprar 2 poções de 15 gasta 30 de cobre', (await wallet()).copper === w0.copper - 30);
  check('as poções entram no inventário', (await nav(() => window.__navor.inventory()))['potion-health-small'] === 2);
  await button('Vender 1: Poção de Vida Pequena').click();
  await page.waitForTimeout(200);
  check('vender uma poção devolve 6 de cobre', (await wallet()).copper === w0.copper - 24);
  await page.screenshot({ path: join(OUT, 'loja-alquimista.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check('Esc fecha a loja', !(await nav(() => window.__navor.panelOpen())));
  await nav(() => window.__navor.setVitals(10, 0));
  await page.keyboard.press('1');
  await page.waitForTimeout(300);
  check('tecla 1 bebe a poção (+40 de vida)', (await nav(() => window.__navor.vitals())).hp === 50);
  check('a poção usada sai do inventário', !(await nav(() => window.__navor.inventory()))['potion-health-small']);
  check('E na porta da Taverna abre a Taverna', await enter('tavern'));
  await button('Dormir: Dormir').click();
  await page.waitForTimeout(200);
  const rested = await nav(() => window.__navor.vitals());
  check('dormir enche vida e mana e custa 15 de cobre', rested.hp === rested.maxHp && rested.mana === rested.maxMana
    && (await wallet()).copper === w0.copper - 39);
  await page.keyboard.press('Escape');
  check('E na porta do Mercado abre o câmbio', await enter('market'));
  await button('1 ouro: Comprar ouro').click();
  await page.waitForTimeout(200);
  const w1 = await wallet();
  check('100 de cobre viram 1 de ouro', w1.gold === w0.gold + 1 && w1.copper === w0.copper - 139, JSON.stringify(w1));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // Equipamentos (Fase 11): comprar, fabricar e melhorar no Ferreiro; equipar na tecla C; vender peça
  await nav(() => window.__navor.grant(500));
  await nav(() => window.__navor.grantItem('leather-simple', 5));
  await nav(() => window.__navor.grantItem('rat-pelt', 1));
  const w2 = await wallet();
  const gearOf = async (itemId) => (await nav(() => window.__navor.gear())).filter((g) => g.itemId === itemId);
  check('E na porta do Ferreiro abre o Ferreiro', await enter('blacksmith'));
  check('o Ferreiro mostra o nome do NPC', await page.getByRole('heading', { name: 'Ferreiro' }).isVisible());
  await button('Comprar: Cajado de Aprendiz').click();
  await page.waitForTimeout(200);
  await button('Comprar: Picareta de Ferro').click();
  await page.waitForTimeout(200);
  check('comprar cajado (30) e picareta (25) cria duas peças', (await gearOf('staff-apprentice')).length === 1
    && (await gearOf('pickaxe-iron')).length === 1 && (await wallet()).copper === w2.copper - 55);
  await button('Fabricar: Capuz de Couro').click();
  await page.waitForTimeout(200);
  check('fabricar o capuz gasta 2 couros, 1 pele e 10 de cobre', (await gearOf('helmet-leather')).length === 1
    && (await nav(() => window.__navor.inventory()))['leather-simple'] === 3 && (await wallet()).copper === w2.copper - 65);
  await button('Melhorar para +1: Capuz de Couro').click();
  await page.waitForTimeout(200);
  check('melhorar leva o capuz a +1 por 20 de cobre e 1 couro', (await gearOf('helmet-leather'))[0]?.upgrade === 1
    && (await nav(() => window.__navor.inventory()))['leather-simple'] === 2 && (await wallet()).copper === w2.copper - 85);
  await page.screenshot({ path: join(OUT, 'loja-ferreiro.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const before = await nav(() => window.__navor.stats());
  await page.keyboard.press('c');
  await page.waitForTimeout(200);
  check('a tecla C abre o equipamento', await page.getByRole('heading', { name: 'Equipamento' }).isVisible());
  await button('Equipar: Cajado de Aprendiz').click();
  await page.waitForTimeout(200);
  await button('Equipar: Capuz de Couro +1').click();
  await page.waitForTimeout(200);
  await button('Equipar: Picareta de Ferro').click();
  await page.waitForTimeout(200);
  const after = await nav(() => window.__navor.stats());
  check('o cajado soma 3 de ataque mágico', after.magAttack === before.magAttack + 3, `${before.magAttack} -> ${after.magAttack}`);
  check('o capuz +1 soma 3 de defesa física', after.physDefense === before.physDefense + 3, `${before.physDefense} -> ${after.physDefense}`);
  check('as três peças ficam equipadas', (await nav(() => window.__navor.gear())).every((g) => g.slot));
  await page.screenshot({ path: join(OUT, 'equipamento.png') });
  await button('Tirar: Cabeça: Capuz de Couro +1').click();
  await page.waitForTimeout(200);
  check('tirar o capuz devolve a defesa', (await nav(() => window.__navor.stats())).physDefense === before.physDefense);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await enter('blacksmith');
  await button('Vender: Capuz de Couro +1').click();
  await page.waitForTimeout(200);
  check('o Ferreiro compra o capuz +1 por 10 de cobre', (await gearOf('helmet-leather')).length === 0 && (await wallet()).copper === w2.copper - 75);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // Habilidades (Fase 12): pontos por nível, aprender na tecla K, foco com pergaminho, Q usa a ativa, evolução
  await nav(() => window.__navor.setLevel(3));
  await page.keyboard.press('k');
  await page.waitForTimeout(200);
  check('a tecla K abre as habilidades', await page.getByRole('heading', { name: 'Habilidades' }).isVisible());
  await button('Aprender: Explosão Arcana (ativa)').click();
  await page.waitForTimeout(200);
  check('aprende a Explosão Arcana com 1 ponto', (await nav(() => window.__navor.skills()))['arcane-burst'] === 1);
  check('sem pergaminho, o foco 2 fica bloqueado', await button('Subir foco: Explosão Arcana (ativa)').isDisabled());
  await nav(() => window.__navor.grantItem('scroll-simple', 1));
  await page.keyboard.press('Escape');
  await page.keyboard.press('k');
  await page.waitForTimeout(200);
  await button('Subir foco: Explosão Arcana (ativa)').click();
  await page.waitForTimeout(200);
  check('com o Pergaminho Simples, sobe ao foco 2 e gasta o pergaminho', (await nav(() => window.__navor.skills()))['arcane-burst'] === 2
    && !(await nav(() => window.__navor.inventory()))['scroll-simple']);
  const magBefore = (await nav(() => window.__navor.stats())).magAttack;
  await button('Aprender: Poder Mágico').click();
  await page.waitForTimeout(200);
  check('Poder Mágico soma ataque mágico', (await nav(() => window.__navor.stats())).magAttack > magBefore);
  check('sem pontos, nada mais pode ser aprendido', await button('Subir: Poder Mágico').isDisabled());
  await page.screenshot({ path: join(OUT, 'habilidades.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await nav(() => window.__navor.setVitals(50, 50));
  await page.keyboard.press('q');
  await page.waitForTimeout(150);
  check('Q usa a Explosão Arcana (gasta 12 de mana)', Math.round((await nav(() => window.__navor.vitals())).mana) <= 39);
  await nav(() => window.__navor.setLevel(25));
  await nav(() => window.__navor.grant(600));
  const w3 = await wallet();
  await page.keyboard.press('k');
  await page.waitForTimeout(200);
  await button('Evoluir: Evoluir para Feiticeiro').click();
  await page.waitForTimeout(300);
  check('no nível 25, o Mago evolui para Feiticeiro por 500 de cobre',
    (await nav(() => window.__navor.classId())) === 'sorcerer' && (await wallet()).copper === w3.copper - 500);
  check('o Feiticeiro vê a árvore nova e mantém a do Mago',
    await page.getByRole('heading', { name: /Feiticeiro/ }).first().isVisible() && (await nav(() => window.__navor.skills()))['arcane-burst'] === 2);
  check('o Feiticeiro passa a usar a própria arte', (await nav(() => window.__navor.player().texture)).startsWith('character:sorcerer:'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // Missões do dia e Covil do Dragão (Fase 13): tecla J, recompensa na cidade, chefe com uma entrada por dia
  const QUESTS = readContent('quests.json');
  await page.keyboard.press('j');
  await page.waitForTimeout(300);
  check('a tecla J abre as missões do dia', await nav(() => window.__navor.questsOpen()));
  const board = await nav(() => window.__navor.quests());
  check(`o dia tem ${QUESTS.perDay} missões diferentes`, board.quests.length === QUESTS.perDay && new Set(board.quests.map((q) => q.questId)).size === QUESTS.perDay);
  // o sorteio usa o nível do começo do dia (0 neste teste); subir de nível não troca as missões do dia
  check('as missões combinam com o nível do sorteio', board.quests.every((q) => QUESTS.templates.find((x) => x.id === q.questId).minLevel === 0),
    board.quests.map((q) => q.questId).join(','));
  const q0 = QUESTS.templates.find((x) => x.id === board.quests[0].questId);
  check('missão por fazer não deixa receber', await button(`Receber: ${q0.name}`).isDisabled());
  await page.screenshot({ path: join(OUT, 'missoes.png') });
  await page.keyboard.press('Escape');
  await nav(() => window.__navor.completeQuest(0));
  const w4 = await wallet();
  const xp4 = (await nav(() => window.__navor.progress())).xp;
  await page.keyboard.press('j');
  await page.waitForTimeout(300);
  await button(`Receber: ${q0.name}`).click();
  await page.waitForTimeout(200);
  check('a missão concluída paga cobre e XP uma vez', (await wallet()).copper === w4.copper + q0.reward.copper
    && (await nav(() => window.__navor.progress())).xp === xp4 + q0.reward.xp && (await nav(() => window.__navor.quests())).quests[0].claimed);
  check('depois de receber, o botão some', (await button(`Receber: ${q0.name}`).count()) === 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await nav(() => window.__navor.heal());
  await nav(() => window.__navor.teleport(2, 23));
  await hold(['ArrowLeft'], 700);
  await waitForMap('dragon-lair').catch(() => {});
  check('o portão oeste leva ao Covil do Dragão', (await nav(() => window.__navor.mapId)) === 'dragon-lair');
  const boss = await nav(() => window.__navor.boss());
  check('o Covil tem o Dragão, em tamanho de chefe', boss?.creatureId === 'dragon' && boss.scale === 2, JSON.stringify(boss));
  check('o Feiticeiro entra numa área nova com a própria arte', (await nav(() => window.__navor.player().texture)).startsWith('character:sorcerer:'),
    await nav(() => window.__navor.player().texture));
  await nav(([x, y]) => window.__navor.teleport(x, y), [boss.cell.x - 2, boss.cell.y]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'covil-dragao.png') });
  await nav(() => window.__navor.hurtPlayer(9999));
  await waitForMap('city').catch(() => {});
  await page.waitForTimeout(300);
  await nav(() => window.__navor.teleport(2, 23));
  await hold(['ArrowLeft'], 700);
  await page.waitForTimeout(600);
  check('no mesmo dia o Covil não abre de novo', (await nav(() => window.__navor.mapId)) === 'city'
    && /já entrou aqui hoje/.test((await nav(() => window.__navor.notice())) ?? ''), await nav(() => window.__navor.notice()));
  await nav(() => window.__navor.teleport(19, 16));
  await page.waitForTimeout(200);

  // Armazém e Mercado entre jogadores (Fase 14): guardar e retirar, anunciar com o item preso, cancelar, recolher vencido
  const exact = (name) => page.getByRole('button', { name, exact: true });
  const bag = async (id) => (await nav(() => window.__navor.inventory()))[id] ?? 0;
  await nav(() => window.__navor.grantItem('iron', 4));
  const iron0 = await bag('iron');
  check('E na porta do Armazém abre o armazém', await enter('warehouse'));
  check('o campo de quantidade tem nome acessível', await page.getByRole('spinbutton', { name: 'Quantidade: Ferro', exact: true }).isVisible());
  await page.getByRole('spinbutton', { name: 'Quantidade: Ferro', exact: true }).fill('3');
  await exact('Guardar: Ferro').click();
  await page.waitForTimeout(200);
  check('guardar 3 Ferros tira da bolsa e põe no armazém', (await bag('iron')) === iron0 - 3
    && await page.getByText('guardado: 3').isVisible());
  await page.screenshot({ path: join(OUT, 'armazem.png') });
  await exact('Retirar: Ferro').click();
  await page.waitForTimeout(200);
  check('retirar devolve os 3 Ferros', (await bag('iron')) === iron0 && (await page.getByText('O armazém está vazio.').isVisible()));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check('o Mercado abre com a parte de anúncios', await enter('market') && await page.getByRole('heading', { name: 'Meus anúncios' }).isVisible());
  await page.getByRole('spinbutton', { name: 'Quantidade: Ferro', exact: true }).fill('2');
  await page.getByRole('spinbutton', { name: 'Preço por unidade: Ferro', exact: true }).fill('7');
  await exact('Anunciar: Ferro').click();
  await page.waitForTimeout(300);
  check('anunciar 2 Ferros prende os itens no anúncio', (await bag('iron')) === iron0 - 2
    && await page.getByText('2 sobrando · 7 de cobre cada').isVisible());
  await page.screenshot({ path: join(OUT, 'mercado.png') });
  await exact('Cancelar: Ferro').click();
  await page.waitForTimeout(300);
  check('cancelar devolve os Ferros à bolsa', (await bag('iron')) === iron0 && await page.getByText('Você não tem anúncios abertos.').isVisible());
  await page.getByRole('spinbutton', { name: 'Quantidade: Ferro', exact: true }).fill('1');
  await exact('Anunciar: Ferro').click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await nav(() => window.__navor.expireListings());
  await enter('market');
  check('anúncio vencido mostra Recolher', await exact('Recolher: Ferro').isVisible());
  await exact('Recolher: Ferro').click();
  await page.waitForTimeout(300);
  check('recolher devolve o que sobrou', (await bag('iron')) === iron0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // Salão de Treinamento, Guilda, ranking e chat (Fase 15)
  const SOCIAL = readContent('social.json');
  const rate = (level) => Math.round(SOCIAL.training.xpPerMinuteBase * 1000) + Math.round(SOCIAL.training.xpPerMinutePerLevel * 1000) * level;
  check('E na porta do Salão abre o treino', await enter('training-hall') && await page.getByRole('heading', { name: 'Salão de Treinamento' }).isVisible());
  const lvl = (await nav(() => window.__navor.progress())).level;
  await button('Começar: Treinar').click();
  await page.waitForTimeout(200);
  check('começar o treino deixa o personagem treinando', (await nav(() => window.__navor.training())).training);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await nav(() => window.__navor.teleport(19, 27));
  await hold(['ArrowDown'], 700);
  await page.waitForTimeout(500);
  check('treinando, o portão não deixa sair da cidade', (await nav(() => window.__navor.mapId)) === 'city'
    && /treinando no Salão/.test((await nav(() => window.__navor.notice())) ?? ''), await nav(() => window.__navor.notice()));
  await nav(() => window.__navor.shiftTraining(90));
  const xp5 = (await nav(() => window.__navor.progress())).xp;
  await enter('training-hall');
  check('a janela mostra o tempo e o XP do treino', await page.getByText(`1 h 30 min · ${Math.floor((90 * rate(lvl)) / 1000)} XP até agora`).isVisible());
  await page.screenshot({ path: join(OUT, 'salao-treino.png') });
  await page.getByRole('button', { name: /^Encerrar e receber/ }).click();
  await page.waitForTimeout(200);
  check('encerrar paga o XP de 90 minutos', (await nav(() => window.__navor.progress())).xp === xp5 + Math.floor((90 * rate(lvl)) / 1000));
  const lvl2 = (await nav(() => window.__navor.progress())).level;
  await button('Começar: Treinar').click();
  await page.waitForTimeout(200);
  await nav(() => window.__navor.shiftTraining(30 * 60));
  const xp6 = (await nav(() => window.__navor.progress())).xp;
  await page.keyboard.press('Escape');
  await enter('training-hall');
  await page.getByRole('button', { name: /^Encerrar e receber/ }).click();
  await page.waitForTimeout(200);
  check(`o treino rende no máximo ${SOCIAL.training.maxHours} h`,
    (await nav(() => window.__navor.progress())).xp === xp6 + Math.floor((SOCIAL.training.maxHours * 60 * rate(lvl2)) / 1000));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  await nav((n) => window.__navor.grant(n), SOCIAL.guilds.createCost);
  const w7 = await wallet();
  check('E na porta da Guilda abre a guilda', await enter('guild') && await page.getByRole('heading', { name: 'Fundar guilda' }).isVisible());
  // digita de verdade: as letras de movimento (d, a, s, w) precisam ir para o campo, não para o jogo
  const pos7 = await p();
  await page.getByRole('textbox', { name: 'Nome: Nova guilda' }).click();
  await page.keyboard.type('Ordem dos Sábios');
  await page.getByRole('textbox', { name: 'Sigla: Nova guilda' }).click();
  await page.keyboard.type('saw');
  await button('Fundar: Nova guilda').click();
  await page.waitForTimeout(300);
  check('fundar a guilda custa o cobre e usa a sigla em maiúsculas', (await wallet()).copper === w7.copper - SOCIAL.guilds.createCost
    && (await nav(() => window.__navor.guildTag())) === 'SAW');
  check('a guilda aparece com os membros', await page.getByRole('heading', { name: `Ordem dos Sábios [SAW] (1/${SOCIAL.guilds.maxMembers})` }).isVisible());
  check('o ranking mostra o jogador com a sigla', await page.getByText('1. Você [SAW]').isVisible());
  check('digitar no campo não move o personagem', Math.abs((await p()).x - pos7.x) < 1 && Math.abs((await p()).y - pos7.y) < 1);
  await page.screenshot({ path: join(OUT, 'guilda.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  check('a presença mostra quem está online', (await nav(() => window.__navor.online())).length === 1 && await page.getByText('1 online').isVisible());
  const pos8 = await p();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  check('Enter abre o chat', await nav(() => window.__navor.chatOpen()));
  await page.keyboard.type('olá pessoal, wasd');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check('a mensagem aparece no chat e o campo fecha', (await nav(() => window.__navor.chat())).includes('Você: olá pessoal, wasd')
    && !(await nav(() => window.__navor.chatOpen())));
  check('digitar no chat não move o personagem', Math.abs((await p()).x - pos8.x) < 1 && Math.abs((await p()).y - pos8.y) < 1);
  await page.keyboard.press('Enter');
  await page.keyboard.type('mais uma');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check('o chat recusa mensagens seguidas demais', await page.getByText('Espere um pouco antes de mandar outra mensagem.').isVisible());
  await page.keyboard.press('Escape');
  await nav(() => window.__navor.resetChatCooldown());
  await page.keyboard.press('Enter');
  await page.keyboard.type('/g reunião na praça');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check('/g manda no canal da guilda', (await nav(() => window.__navor.chat())).includes('[Guilda] Você: reunião na praça'));
  await page.screenshot({ path: join(OUT, 'chat.png') });
  await enter('guild');
  await button('Sair: Sair da guilda').click();
  await page.waitForTimeout(300);
  check('o último a sair acaba com a guilda', (await nav(() => window.__navor.guildTag())) === null
    && await page.getByRole('heading', { name: 'Fundar guilda' }).isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check('o personagem anda de novo depois do chat', await (async () => {
    const a = await p();
    await hold(['ArrowRight'], 300);
    return (await p()).x > a.x + 5;
  })());

  // Floresta (Fase 9): portão leste da cidade, animais que fogem, Esquilos de enfeite, recursos da floresta
  await nav(() => window.__navor.teleport(37, 23));
  await hold(['ArrowRight'], 900);
  await waitForMap('forest').catch(() => {});
  check('o portão leste leva à Floresta', (await nav(() => window.__navor.mapId)) === 'forest');
  await page.screenshot({ path: join(OUT, 'floresta.png') });
  const forestSpawns = new Set(FOREST.creatures.spawn.map((x) => x.creature));
  const animals = await nav(() => window.__navor.monsters());
  check('a Floresta tem de 5 a 8 animais, só da Floresta',
    animals.length >= 5 && animals.length <= 8 && animals.every((a) => forestSpawns.has(a.creatureId)), animals.map((a) => a.creatureId).join(','));
  const critters = await nav(() => window.__navor.critters());
  check('a Floresta tem de 2 a 4 Esquilos de enfeite', critters.length >= 2 && critters.length <= 4 && critters.every((c) => c.creatureId === 'squirrel'));
  const forestNodes = await nav(() => window.__navor.nodes());
  check('os pontos de coleta dão recursos da Floresta', forestNodes.length >= 8 && forestNodes.every((n) => FOREST.resources.items.includes(n.itemId)));
  const spider = animals.find((a) => a.creatureId === 'giant-spider');
  if (spider) check('a Aranha Gigante fica quase invisível de longe', spider.alpha < 1, String(spider.alpha));
  const shy = animals.find((a) => a.creatureId === 'deer' || a.creatureId === 'rabbit');
  if (shy) {
    await nav(([x, y]) => window.__navor.teleport(x, y), [shy.cell.x - 1, shy.cell.y]);
    await page.waitForTimeout(150);
    const fleeing = (await nav(() => window.__navor.monsters())).find((a) => a.index === shy.index);
    await page.waitForTimeout(700);
    const me = await p();
    const after = (await nav(() => window.__navor.monsters())).find((a) => a.index === shy.index);
    check(`o ${shy.creatureId === 'deer' ? 'Cervo' : 'Coelho'} foge do jogador`, fleeing.intent === 'flee'
      && Math.hypot(after.x - me.x, after.y - me.y) > Math.hypot(shy.x - (shy.cell.x - 1) * T - T / 2, shy.y - shy.cell.y * T - T / 2),
      `${fleeing.intent}, distância ${Math.round(Math.hypot(after.x - me.x, after.y - me.y))} px`);
  }
  await nav(() => window.__navor.hurtPlayer(9999));
  await waitForMap('city').catch(() => {});

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
    const enteredAt = Date.now();
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
    if (classId === 'warrior') {
      // Baú (Fase 9): a Gruta sempre tem pelo menos um; abre alguns segundos depois da entrada e dá cobre
      const chest = (await ev(() => window.__navor.chests()))[0];
      check('a Gruta tem baú', Boolean(chest));
      const copper0 = (await ev(() => window.__navor.progress())).copper;
      await pg.waitForTimeout(Math.max(0, 10500 - (Date.now() - enteredAt)));
      await ev(() => window.__navor.heal());
      await ev(([x, y]) => window.__navor.teleport(x, y), [chest.x, chest.y]);
      await pg.waitForTimeout(150);
      check('perto do baú aparece "E: abrir o baú"', (await ev(() => window.__navor.collectPrompt())) === 'E: abrir o baú');
      await pg.keyboard.press('e');
      await pg.waitForTimeout(400);
      const opened = (await ev(() => window.__navor.chests())).find((c) => c.index === chest.index);
      const copper1 = (await ev(() => window.__navor.progress())).copper;
      check('o baú abre e dá cobre', opened.state === 'open' && copper1 >= copper0 + 3, `${opened.state}, cobre ${copper0} -> ${copper1}`);
      await pg.screenshot({ path: join(OUT, 'gruta-bau.png') });
    }
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
