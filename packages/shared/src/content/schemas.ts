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
        arriveAt: gridPoint,
        label: z.string().min(1),
      }),
    )
    .default([]),
});

export type Rarities = z.infer<typeof raritiesSchema>;
export type Classes = z.infer<typeof classesSchema>;
export type TileDefs = z.infer<typeof tilesSchema>;
export type TileDef = TileDefs['tiles'][number];
export type Balance = z.infer<typeof balanceSchema>;
export type AsciiMap = z.infer<typeof asciiMapSchema>;
export type ObjectDefs = z.infer<typeof objectsSchema>;
export type ObjectDef = ObjectDefs['objects'][number];
export type World = z.infer<typeof worldSchema>;
