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
        char: z.string().length(1),
        index: z.number().int().min(0),
        solid: z.boolean(),
        name: z.string().min(1),
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

export const asciiMapSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  spawnChar: z.string().length(1),
  spawnTile: z.string().min(1),
  rows: z.array(z.string().min(1)).min(1),
});

export type Rarities = z.infer<typeof raritiesSchema>;
export type Classes = z.infer<typeof classesSchema>;
export type TileDefs = z.infer<typeof tilesSchema>;
export type TileDef = TileDefs['tiles'][number];
export type Balance = z.infer<typeof balanceSchema>;
export type AsciiMap = z.infer<typeof asciiMapSchema>;
