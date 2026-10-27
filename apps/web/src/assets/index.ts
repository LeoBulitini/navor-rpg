import type { Facing } from '@navor/shared';
import { content } from '../content.ts';
import manifest from './manifest.json';
import characterArt from './characters.json';

export const assets = manifest;

/** Chaves de textura usadas no Phaser. */
export const TextureKeys = {
  tileset: 'tileset',
  character: (classId: string, facing: Facing) => `character:${classId}:${facing}`,
  object: (sprite: string) => `object:${sprite}`,
  item: (icon: string) => `item:${icon}`,
  creature: (sprite: string) => `creature:${sprite}`,
  effect: (sprite: string) => `effect:${sprite}`,
} as const;

/** PNG de um objeto (prédio, árvore...) pelo 'sprite' de content/objects.json. */
export function objectSpritePath(sprite: string): string {
  return `${manifest.objects.path}/${sprite}.png`;
}

/** Ícones a carregar: os de content/items.json mais o genérico. */
export function itemIcons(): string[] {
  return [...new Set([...content.items.items.flatMap((i) => (i.icon ? [i.icon] : [])), manifest.items.fallback])];
}

export function itemIconPath(icon: string): string {
  return `${manifest.items.path}/${icon}.png`;
}

/** Textura do ícone de um item; sem ícone próprio, o genérico. */
export function itemTexture(itemId: string): string {
  const icon = content.items.items.find((i) => i.id === itemId)?.icon ?? manifest.items.fallback;
  return TextureKeys.item(icon);
}

/** Tira de quadros de um monstro pelo 'sprite' de content/creatures.json. */
export function creatureSpritePath(sprite: string): string {
  return `${manifest.creatures.path}/${sprite}.png`;
}

export function effectSpritePath(sprite: string): string {
  return `${manifest.effects.path}/${sprite}.png`;
}

/** Classe usada quando não há personagem online (modo offline). */
export const OFFLINE_CLASS_ID = 'mage';

export function hasCharacterArt(classId: string): boolean {
  return characterArt.classIds.includes(classId);
}

/** Caminho do PNG de uma direção; classes ainda sem arte usam o placeholder. */
export function characterSpritePath(classId: string, facing: Facing): string {
  const { path, placeholderPath } = manifest.characters;
  return hasCharacterArt(classId) ? `${path}/${classId}/${facing}.png` : `${placeholderPath}/${facing}.png`;
}

/** Há arte placeholder na tela? (tileset ou o personagem desta classe) */
export function usesPlaceholderArt(classId: string): boolean {
  return manifest.tileset.placeholder || !hasCharacterArt(classId);
}
