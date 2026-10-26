import manifest from './manifest.json';

export const assets = manifest;

/** Chaves de textura usadas no Phaser. */
export const TextureKeys = {
  tileset: 'tileset',
  mage: 'mage',
} as const;

export const usesPlaceholderArt = Object.values(manifest).some(
  (entry) => typeof entry === 'object' && entry !== null && 'placeholder' in entry && entry.placeholder,
);
