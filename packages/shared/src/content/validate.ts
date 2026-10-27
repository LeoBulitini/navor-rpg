import type { z } from 'zod';
import {
  asciiMapSchema,
  balanceSchema,
  classesSchema,
  combatSchema,
  creaturesSchema,
  equipmentSchema,
  itemsSchema,
  objectsSchema,
  proceduralSchema,
  progressionSchema,
  raritiesSchema,
  recipesSchema,
  skillsSchema,
  questsSchema,
  shopsSchema,
  tilesSchema,
  worldSchema,
  type AsciiMap,
  type Balance,
  type Classes,
  type Combat,
  type Creatures,
  type Equipment,
  type Items,
  type ObjectDefs,
  type Procedural,
  type Progression,
  type Rarities,
  type Recipes,
  type Skills,
  type Quests,
  type Shops,
  type TileDefs,
  type World,
} from './schemas.ts';
import { exitAt, isWalkable, parseAsciiMap, reachableFrom, type GridPoint, type ParsedMap } from '../map/tilemap.ts';
import { generateCave } from '../procgen/cave.ts';
import { placeChests } from '../procgen/chests.ts';
import { placeResourceNodes } from '../procgen/resources.ts';
import { placeMonsters } from '../procgen/creatures.ts';

export interface RawContent {
  rarities: unknown;
  classes: unknown;
  tiles: unknown;
  balance: unknown;
  objects: unknown;
  items: unknown;
  creatures: unknown;
  progression: unknown;
  combat: unknown;
  world: unknown;
  procedural: unknown;
  shops: unknown;
  equipment: unknown;
  recipes: unknown;
  skills: unknown;
  quests: unknown;
  maps: Record<string, unknown>;
}

export interface Content {
  rarities: Rarities;
  classes: Classes;
  tiles: TileDefs;
  balance: Balance;
  objects: ObjectDefs;
  items: Items;
  creatures: Creatures;
  progression: Progression;
  combat: Combat;
  world: World;
  procedural: Procedural;
  shops: Shops;
  equipment: Equipment;
  recipes: Recipes;
  skills: Skills;
  quests: Quests;
  maps: Record<string, AsciiMap>;
}

function parseWith<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.') || '(raiz)'}: ${i.message}`);
    throw new Error(`Conteúdo inválido em ${label}:\n${issues.join('\n')}`);
  }
  return result.data;
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) throw new Error(`Valor duplicado em ${label}: "${v}"`);
    seen.add(v);
  }
}

/** Valida todo o conteúdo e as referências cruzadas. Lança erro legível se algo estiver errado. */
export function loadContent(raw: RawContent): Content {
  const rarities = parseWith(raritiesSchema, raw.rarities, 'rarities.json');
  const classes = parseWith(classesSchema, raw.classes, 'classes.json');
  const tiles = parseWith(tilesSchema, raw.tiles, 'tiles.json');
  const balance = parseWith(balanceSchema, raw.balance, 'balance.prototype.json');

  assertUnique(rarities.rarities.map((r) => r.id), 'rarities.json (id)');
  assertUnique(classes.paths.flatMap((p) => p.stages.map((s) => s.classId)), 'classes.json (classId)');
  assertUnique(tiles.tiles.map((t) => t.id), 'tiles.json (id)');
  assertUnique(tiles.tiles.flatMap((t) => (t.char ? [t.char] : [])), 'tiles.json (char)');
  assertUnique(tiles.tiles.map((t) => String(t.index)), 'tiles.json (index)');
  const tileById = new Map(tiles.tiles.map((t) => [t.id, t]));
  for (const t of tiles.tiles) {
    for (const v of t.variants ?? []) {
      const variant = tileById.get(v);
      if (!variant) throw new Error(`tiles.json: variação "${v}" de "${t.id}" não existe`);
      if (variant.solid !== t.solid) throw new Error(`tiles.json: variação "${v}" precisa ter o mesmo 'solid' de "${t.id}"`);
    }
  }

  const objects = parseWith(objectsSchema, raw.objects, 'objects.json');
  assertUnique(objects.objects.map((o) => o.id), 'objects.json (id)');
  const world = parseWith(worldSchema, raw.world, 'world.json');

  const items = parseWith(itemsSchema, raw.items, 'items.json');
  assertUnique(items.items.map((i) => i.id), 'items.json (id)');
  const rarityIds = new Set(rarities.rarities.map((r) => r.id));
  for (const item of items.items) {
    if (!rarityIds.has(item.rarity)) throw new Error(`items.json: raridade "${item.rarity}" de "${item.id}" não existe em rarities.json`);
  }
  const itemById = new Map(items.items.map((i) => [i.id, i]));

  const creatures = parseWith(creaturesSchema, raw.creatures, 'creatures.json');
  assertUnique(creatures.creatures.map((c) => c.id), 'creatures.json (id)');
  for (const c of creatures.creatures) {
    for (const d of c.drops) {
      if (!itemById.has(d.item)) throw new Error(`creatures.json: "${c.id}" solta "${d.item}", que não existe em items.json`);
    }
  }
  const creatureIds = new Set(creatures.creatures.map((c) => c.id));

  const progression = parseWith(progressionSchema, raw.progression, 'progression.json');
  assertUnique(progression.pathStats.map((c) => c.pathId), 'progression.json (pathId)');
  const combat = parseWith(combatSchema, raw.combat, 'combat.json');
  // todo caminho de classe precisa de atributos e de um ataque básico
  for (const path of classes.paths) {
    if (!progression.pathStats.some((ps) => ps.pathId === path.id)) throw new Error(`progression.json: faltam os atributos do caminho "${path.id}"`);
    if (!combat.basicAttacks[path.id]) throw new Error(`combat.json: falta o ataque básico do caminho "${path.id}"`);
  }
  for (const id of [...progression.pathStats.map((p) => p.pathId), ...Object.keys(combat.basicAttacks)]) {
    if (!classes.paths.some((p) => p.id === id)) throw new Error(`progression.json/combat.json: caminho "${id}" não existe em classes.json`);
  }

  const maps: Record<string, AsciiMap> = {};
  const parsed: Record<string, ParsedMap> = {};
  for (const [file, value] of Object.entries(raw.maps)) {
    const map = parseWith(asciiMapSchema, value, `maps/${file}`);
    if (maps[map.id]) throw new Error(`Dois mapas com o id "${map.id}"`);
    // valida legenda, formato, bordas, objetos e alcance
    parsed[map.id] = parseAsciiMap(map, tiles, objects, balance.tileSize);
    maps[map.id] = map;
  }

  const procedural = parseWith(proceduralSchema, raw.procedural, 'procedural.json');
  const areas = new Map(procedural.areas.map((a) => [a.id, a]));
  for (const area of procedural.areas) {
    if (maps[area.id]) throw new Error(`procedural.json: "${area.id}" tem o mesmo id de um mapa fixo`);
    const known = new Set(tiles.tiles.flatMap((t) => (t.char ? [t.char] : [])));
    for (const [role, ch] of Object.entries(area.chars)) {
      if (!known.has(ch)) throw new Error(`procedural.json: ${area.id}.chars.${role} "${ch}" não existe em tiles.json`);
    }
    // uma geração de amostra garante que a configuração consegue produzir um mapa válido
    const sample = generateCave(area, tiles, 1);
    const res = area.resources;
    if (res) {
      const where = `procedural.json: ${area.id}.resources`;
      assertUnique(res.items, `${where}.items`);
      assertUnique(res.rarities.map((r) => r.rarity), `${where}.rarities`);
      const ruled = new Set(res.rarities.map((r) => r.rarity));
      for (const id of res.items) {
        const item = itemById.get(id);
        if (!item) throw new Error(`${where}: item "${id}" não existe em items.json`);
        if (!ruled.has(item.rarity)) throw new Error(`${where}: item "${id}" é ${item.rarity}, mas essa raridade não tem regra em 'rarities'`);
      }
      for (const r of res.rarities) {
        if (!rarityIds.has(r.rarity)) throw new Error(`${where}: raridade "${r.rarity}" não existe em rarities.json`);
        if (!res.items.some((id) => itemById.get(id)?.rarity === r.rarity)) throw new Error(`${where}: nenhum item da raridade "${r.rarity}"`);
      }
      // o maior número de pontos precisa caber no mapa de amostra
      placeResourceNodes(parseAsciiMap(sample.map, tiles), sample.seed, res.nodes.max, res);
    }
    const cr = area.creatures;
    if (cr) {
      const where = `procedural.json: ${area.id}.creatures`;
      assertUnique(cr.spawn.map((x) => x.creature), `${where}.spawn`);
      for (const x of cr.spawn) {
        if (!creatureIds.has(x.creature)) throw new Error(`${where}: monstro "${x.creature}" não existe em creatures.json`);
      }
      const isDecor = new Map(creatures.creatures.map((c) => [c.id, c.decorative]));
      for (const x of cr.spawn) {
        if (isDecor.get(x.creature)) throw new Error(`${where}: "${x.creature}" é decorativo; ponha-o em 'decor', não em 'spawn'`);
      }
      for (const x of cr.decor) {
        if (!creatureIds.has(x.creature)) throw new Error(`${where}.decor: "${x.creature}" não existe em creatures.json`);
        if (!isDecor.get(x.creature)) throw new Error(`${where}.decor: "${x.creature}" precisa de "decorative": true`);
      }
    }
    // O pior caso (máximo de pontos, de monstros, todos no fundo, e de baús) precisa caber no mapa de amostra.
    const map = parseAsciiMap(sample.map, tiles);
    const nodes = res ? placeResourceNodes(map, sample.seed, res.nodes.max, res) : [];
    const monsters = cr ? placeMonsters(map, sample.seed, cr.count.max, cr, nodes, () => true) : [];
    const ch = area.chests;
    if (ch) {
      const where = `procedural.json: ${area.id}.chests`;
      assertUnique(ch.items.map((x) => x.item), `${where}.items`);
      for (const x of ch.items) {
        if (!itemById.has(x.item)) throw new Error(`${where}: item "${x.item}" não existe em items.json`);
      }
      placeChests(map, sample.seed, ch.count.max, ch, [...nodes, ...monsters]);
    }
  }

  const shops = parseWith(shopsSchema, raw.shops, 'shops.json');
  assertUnique(shops.shops.map((x) => x.id), 'shops.json (id)');
  assertUnique(shops.shops.map((x) => x.building), 'shops.json (building)');
  const categories = new Set(items.items.map((i) => i.category));
  for (const shop of shops.shops) {
    const where = `shops.json: ${shop.id}`;
    if (!objects.objects.find((o) => o.id === shop.building)?.door) throw new Error(`${where}: prédio "${shop.building}" não existe ou não tem porta`);
    assertUnique(shop.sells.map((x) => x.item), `${where}.sells`);
    for (const id of [...shop.sells.map((x) => x.item), ...shop.buys.items]) {
      if (!itemById.has(id)) throw new Error(`${where}: item "${id}" não existe em items.json`);
    }
    for (const c of shop.buys.categories) if (!categories.has(c as never)) throw new Error(`${where}: categoria "${c}" não existe`);
  }
  if (!shops.shops.some((x) => x.playerMarket)) throw new Error('shops.json: nenhum prédio tem o mercado entre jogadores (playerMarket)');
  if (!shops.shops.some((x) => x.storage)) throw new Error('shops.json: nenhum prédio tem o armazém (storage)');

  const equipment = parseWith(equipmentSchema, raw.equipment, 'equipment.json');
  assertUnique(equipment.slots.map((x) => x.id), 'equipment.json (slots)');
  const slotById = new Map(equipment.slots.map((x) => [x.id, x]));
  for (const r of Object.keys(equipment.gatherTiers)) {
    if (!rarityIds.has(r)) throw new Error(`equipment.json: gatherTiers usa a raridade "${r}", que não existe`);
  }
  const gearCategories = new Set(['weapon', 'armor', 'shield', 'accessory', 'tool']);
  const pathIds = new Set(classes.paths.map((x) => x.id));
  for (const item of items.items) {
    const where = `items.json: ${item.id}`;
    if (gearCategories.has(item.category) !== Boolean(item.equip)) throw new Error(`${where}: só armas, armaduras, escudos, acessórios e ferramentas têm 'equip' (e todos precisam ter)`);
    if (item.gather && !slotById.get(item.gather)?.tool) throw new Error(`${where}: 'gather' "${item.gather}" não é um espaço de ferramenta`);
    const e = item.equip;
    if (!e) continue;
    const slot = slotById.get(e.slot);
    if (!slot) throw new Error(`${where}: espaço "${e.slot}" não existe em equipment.json`);
    if (slot.tool !== (e.toolTier !== undefined)) throw new Error(`${where}: ferramentas (e só elas) têm 'toolTier'`);
    for (const pid of e.paths ?? []) if (!pathIds.has(pid)) throw new Error(`${where}: caminho "${pid}" não existe em classes.json`);
    if (e.upgradeMaterial) {
      const mat = itemById.get(e.upgradeMaterial);
      if (!mat || mat.equip) throw new Error(`${where}: material de melhoria "${e.upgradeMaterial}" não existe ou é equipamento`);
      if (Object.values(e.stats).every((v) => v === 0)) throw new Error(`${where}: peça sem atributos não pode ter melhoria`);
    }
  }
  const recipes = parseWith(recipesSchema, raw.recipes, 'recipes.json');
  assertUnique(recipes.recipes.map((x) => x.id), 'recipes.json (id)');
  for (const r of recipes.recipes) {
    const where = `recipes.json: ${r.id}`;
    if (!shops.shops.some((x) => x.id === r.shop)) throw new Error(`${where}: serviço "${r.shop}" não existe em shops.json`);
    if (!itemById.has(r.item)) throw new Error(`${where}: item "${r.item}" não existe em items.json`);
    assertUnique(r.materials.map((m) => m.item), `${where}.materials`);
    for (const m of r.materials) {
      const mat = itemById.get(m.item);
      if (!mat || mat.equip) throw new Error(`${where}: material "${m.item}" não existe ou é equipamento`);
    }
  }

  const skills = parseWith(skillsSchema, raw.skills, 'skills.json');
  const classIds = classes.paths.flatMap((x) => x.stages.map((st) => st.classId));
  for (const id of classIds) if (!skills.classes[id]) throw new Error(`skills.json: falta a classe "${id}"`);
  for (const id of Object.keys(skills.classes)) if (!classIds.includes(id)) throw new Error(`skills.json: classe "${id}" não existe em classes.json`);
  const allSkills = Object.values(skills.classes).flatMap((c) => [c.active, ...c.passives]);
  assertUnique(allSkills.map((x) => x.id), 'skills.json (id das habilidades)');
  const attackSprites = new Set(Object.values(combat.basicAttacks).map((a) => a.sprite));
  for (const [classId, c] of Object.entries(skills.classes)) {
    if (!attackSprites.has(c.active.sprite)) throw new Error(`skills.json: ${classId}.active usa o efeito "${c.active.sprite}", que nenhum ataque básico carrega`);
    for (const ps of c.passives) {
      if (ps.effect.values.length !== skills.gradeCosts.length) throw new Error(`skills.json: ${ps.id} precisa de ${skills.gradeCosts.length} valores (um por graduação)`);
      if (ps.effect.values.some((v, i) => i > 0 && v <= ps.effect.values[i - 1]!)) throw new Error(`skills.json: ${ps.id} precisa crescer a cada graduação`);
    }
  }
  for (const id of skills.focusScrolls) if (id && itemById.get(id)?.category !== 'scroll') throw new Error(`skills.json: "${id}" não é um pergaminho de items.json`);
  const stageLevels = [...new Set(classes.paths.flatMap((x) => x.stages.map((st) => st.level)).filter((l) => l > 0))].sort((a, b) => a - b);
  if (JSON.stringify(skills.evolution.map((e) => e.level)) !== JSON.stringify(stageLevels)) {
    throw new Error(`skills.json: 'evolution' precisa de um custo para cada etapa de classe (${stageLevels.join(', ')})`);
  }

  const quests = parseWith(questsSchema, raw.quests, 'quests.json');
  assertUnique(quests.templates.map((x) => x.id), 'quests.json (id)');
  const spawnable = new Set(procedural.areas.flatMap((a) => a.creatures?.spawn.map((x) => x.creature) ?? []));
  const gatherable = new Set(procedural.areas.flatMap((a) => a.resources?.items ?? []));
  for (const t of quests.templates) {
    const where = `quests.json: ${t.id}`;
    if (t.kind === 'kill' && !spawnable.has(t.target)) throw new Error(`${where}: "${t.target}" não aparece em nenhuma área (spawn de procedural.json)`);
    if (t.kind === 'collect' && !gatherable.has(t.target)) throw new Error(`${where}: "${t.target}" não sai de nenhum ponto de coleta de procedural.json`);
    if (t.maxLevel !== undefined && t.maxLevel < t.minLevel) throw new Error(`${where}: maxLevel menor que minLevel`);
    for (const r of t.reward.items) if (!itemById.has(r.item) || itemById.get(r.item)!.equip) throw new Error(`${where}: recompensa "${r.item}" não existe ou é equipamento`);
  }
  // todo nível precisa ter missões suficientes para o sorteio do dia
  for (let level = 0; level <= classes.maxLevel; level++) {
    const n = quests.templates.filter((t) => t.minLevel <= level && (t.maxLevel === undefined || level <= t.maxLevel)).length;
    if (n < quests.perDay) throw new Error(`quests.json: o nível ${level} só tem ${n} missões (precisa de ${quests.perDay})`);
  }

  if (!maps[world.startMap]) throw new Error(`world.json: startMap "${world.startMap}" não existe em maps/`);

  // Ponto de chegada num mapa fixo: livre, alcançável e fora de outra saída (senão o jogador ficaria indo e voltando).
  const checkArrival = (where: string, to: string, arriveAt: GridPoint | undefined) => {
    if (areas.has(to)) return; // mapa gerado: o jogador chega pelo ponto de entrada dele
    const target = parsed[to];
    if (!target) throw new Error(`${where}: mapa de destino "${to}" não existe`);
    if (!arriveAt) throw new Error(`${where}: falta arriveAt (obrigatório para mapa fixo)`);
    if (!isWalkable(target, arriveAt)) throw new Error(`${where}: arriveAt está bloqueado no destino`);
    if (!reachableFrom(target, target.spawn).has(`${arriveAt.x},${arriveAt.y}`)) {
      throw new Error(`${where}: arriveAt não é alcançável no destino`);
    }
    if (exitAt(target, arriveAt)) throw new Error(`${where}: arriveAt fica dentro de uma saída do destino`);
  };
  for (const map of Object.values(parsed)) {
    for (const exit of map.exits) checkArrival(`Mapa ${map.id}: saída para "${exit.to}"`, exit.to, exit.arriveAt);
  }
  for (const area of procedural.areas) checkArrival(`procedural.json: ${area.id}.returnTo`, area.returnTo.map, area.returnTo.arriveAt);

  return { rarities, classes, tiles, balance, objects, items, creatures, progression, combat, world, procedural, shops, equipment, recipes, skills, quests, maps };
}
