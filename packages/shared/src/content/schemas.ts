import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor deve ser #RRGGBB');

export const raritiesSchema = z.object({
  rarities: z
    .array(z.object({ id: z.string().min(1), name: z.string().min(1), color: hexColor }))
    .min(1),
});

export const classesSchema = z.object({
  maxLevel: z.number().int().positive(),
  paths: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        stages: z
          .array(
            z.object({
              level: z.number().int().min(0),
              classId: z.string().min(1),
              name: z.string().min(1),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

export const tilesSchema = z.object({
  tiles: z
    .array(
      z.object({
        id: z.string().min(1),
        /** Sem 'char', o tile só aparece como variação visual de outro. */
        char: z.string().length(1).optional(),
        index: z.number().int().min(0),
        solid: z.boolean(),
        name: z.string().min(1),
        variants: z.array(z.string().min(1)).optional(),
      }),
    )
    .min(1),
});

export const balanceSchema = z.object({
  tileSize: z.number().int().positive(),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  player: z.object({
    moveSpeedTilesPerSecond: z.number().positive(),
    hitbox: z.object({
      width: z.number().positive(),
      height: z.number().positive(),
      offsetX: z.number().min(0),
      offsetY: z.number().min(0),
    }),
  }),
});

const pixelRect = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});
const gridPoint = z.object({ x: z.number().int().min(0), y: z.number().int().min(0) });

export const objectsSchema = z.object({
  objects: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        sprite: z.string().min(1),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        collider: pixelRect,
        door: pixelRect.extend({ message: z.string().min(1) }).optional(),
      }),
    )
    .min(1),
});

export const worldSchema = z.object({ startMap: z.string().min(1) });

export const asciiMapSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  spawnChar: z.string().length(1),
  spawnTile: z.string().min(1),
  rows: z.array(z.string().min(1)).min(1),
  /** Prédios e decoração de objects.json, pelo canto superior esquerdo do sprite, em tiles. */
  objects: z.array(gridPoint.extend({ ref: z.string().min(1) })).default([]),
  /** Áreas (em tiles) que levam a outro mapa; 'arriveAt' é onde o jogador aparece lá. */
  exits: z
    .array(
      gridPoint.extend({
        w: z.number().int().positive(),
        h: z.number().int().positive(),
        to: z.string().min(1),
        /** Obrigatório para mapas fixos; mapas gerados (Gruta) usam o próprio ponto de entrada. */
        arriveAt: gridPoint.optional(),
        label: z.string().min(1),
      }),
    )
    .default([]),
});

const range = z
  .object({ min: z.number().int().min(0), max: z.number().int().min(0) })
  .refine((r) => r.min <= r.max, 'min deve ser menor ou igual a max');

export const itemsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/, 'use letras minúsculas, números e hífen'),
        name: z.string().min(1),
        rarity: z.string().min(1),
        category: z.enum(['ore', 'resource', 'scroll']),
        /** PNG em apps/web/public/assets/items/; sem ele, o jogo mostra o ícone genérico. */
        icon: z.string().min(1).optional(),
      }),
    )
    .min(1),
});

/** Pontos de coleta de uma área. O servidor sorteia o conteúdo; o cliente só posiciona. */
export const resourcesConfigSchema = z.object({
  nodes: range,
  /** distância mínima (em tiles, Chebyshev) entre dois pontos */
  minDistance: z.number().int().min(1),
  /** distância mínima (em tiles) da entrada, da saída e do nascimento */
  clearance: z.number().int().min(0),
  rarities: z
    .array(z.object({ rarity: z.string().min(1), weight: z.number().int().positive(), quantity: range.refine((r) => r.min >= 1, 'quantidade mínima é 1') }))
    .min(1),
  items: z.array(z.string().min(1)).min(1),
  expiresMinutes: z.number().int().positive(),
  collectCooldownMs: z.number().int().min(0),
  maxStartsPerMinute: z.number().int().positive(),
});

/** Monstros por entrada numa área. O servidor sorteia o tipo; o cliente posiciona. */
export const creaturesConfigSchema = z.object({
  count: range,
  /** distância mínima (em tiles) da entrada, da saída e do nascimento */
  clearance: z.number().int().min(0),
  spawn: z.array(z.object({ creature: z.string().min(1), weight: z.number().int().positive() })).min(1),
});

const stats = z.object({
  hp: z.number().positive(),
  attack: z.number().min(0),
  defense: z.number().min(0),
});

export const creaturesSchema = z.object({
  creatures: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/, 'use letras minúsculas, números e hífen'),
        name: z.string().min(1),
        sprite: z.string().min(1),
        stats: stats.extend({ hp: z.number().int().positive() }),
        moveSpeedTilesPerSecond: z.number().positive(),
        detectTiles: z.number().positive(),
        attackRangeTiles: z.number().positive(),
        attackCooldownMs: z.number().int().positive(),
        xp: z.number().int().min(0),
        copper: range,
        drops: z.array(
          z.object({
            item: z.string().min(1),
            chance: z.number().gt(0).max(1),
            quantity: range.refine((r) => r.min >= 1, 'quantidade mínima é 1'),
          }),
        ),
      }),
    )
    .min(1),
});

export const progressionSchema = z.object({
  xpCurve: z.object({ base: z.number().positive(), exponent: z.number().positive() }),
  classStats: z
    .array(
      z.object({
        classId: z.string().min(1),
        base: stats.extend({ mana: z.number().min(0) }),
        perLevel: z.object({ hp: z.number().min(0), mana: z.number().min(0), attack: z.number().min(0), defense: z.number().min(0) }),
      }),
    )
    .min(1),
});

export const combatSchema = z.object({
  basicAttack: z.object({
    name: z.string().min(1),
    sprite: z.string().min(1),
    manaCost: z.number().min(0),
    cooldownMs: z.number().int().positive(),
    projectileSpeedTilesPerSecond: z.number().positive(),
    rangeTiles: z.number().positive(),
  }),
  manaRegenPerSecond: z.number().min(0),
  critChance: z.number().min(0).max(1),
  critMultiplier: z.number().min(1),
  damageVariance: z.number().min(0).max(0.9),
  defenseFactor: z.number().min(0),
  invulnerableAfterHitMs: z.number().int().min(0),
  server: z.object({ maxDamagePerSecond: z.object({ base: z.number().positive(), perLevel: z.number().min(0) }) }),
});

/** Parâmetros de uma área gerada por seed. Valores provisórios (GDD 7.3: tamanhos e densidades A DEFINIR). */
export const caveConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  width: z.number().int().min(16).max(64),
  height: z.number().int().min(16).max(64),
  rooms: range,
  roomSize: range,
  corridorWidth: z.number().int().min(1).max(3),
  extraCorridors: range,
  rocks: range,
  spawnChar: z.string().length(1),
  spawnTile: z.string().min(1),
  chars: z.object({
    floor: z.string().length(1),
    wall: z.string().length(1),
    rock: z.string().length(1),
    entrance: z.string().length(1),
    exit: z.string().length(1),
  }),
  returnTo: z.object({ map: z.string().min(1), arriveAt: gridPoint }),
  resources: resourcesConfigSchema.optional(),
  creatures: creaturesConfigSchema.optional(),
});
export const proceduralSchema = z.object({ areas: z.array(caveConfigSchema).min(1) });

export type Rarities = z.infer<typeof raritiesSchema>;
export type Classes = z.infer<typeof classesSchema>;
export type TileDefs = z.infer<typeof tilesSchema>;
export type TileDef = TileDefs['tiles'][number];
export type Balance = z.infer<typeof balanceSchema>;
export type AsciiMap = z.infer<typeof asciiMapSchema>;
export type ObjectDefs = z.infer<typeof objectsSchema>;
export type ObjectDef = ObjectDefs['objects'][number];
export type World = z.infer<typeof worldSchema>;
export type CaveConfig = z.infer<typeof caveConfigSchema>;
export type Procedural = z.infer<typeof proceduralSchema>;
export type Items = z.infer<typeof itemsSchema>;
export type ItemDef = Items['items'][number];
export type ResourcesConfig = z.infer<typeof resourcesConfigSchema>;
export type CreaturesConfig = z.infer<typeof creaturesConfigSchema>;
export type Creatures = z.infer<typeof creaturesSchema>;
export type CreatureDef = Creatures['creatures'][number];
export type Progression = z.infer<typeof progressionSchema>;
export type ClassStats = Progression['classStats'][number];
export type Combat = z.infer<typeof combatSchema>;
