"""Ícone provisório do app Windows: o Mago (south.png) ampliado sobre um fundo escuro.

Gera apps/desktop/app-icon.png (1024x1024). Depois, em apps/desktop, rode `npx tauri icon app-icon.png`
para criar os tamanhos em apps/desktop/src-tauri/icons. Para trocar, substitua app-icon.png e rode de novo.
"""
import os

from PIL import Image, ImageDraw

from city_art import ROOT

SRC = os.path.join(ROOT, 'apps', 'web', 'public', 'assets', 'characters', 'mage', 'south.png')
OUT = os.path.join(ROOT, 'apps', 'desktop', 'app-icon.png')


def main():
    sprite = Image.open(SRC).convert('RGBA').crop((0, 0, 32, 32))
    icon = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    ImageDraw.Draw(icon).rounded_rectangle((16, 16, 1008, 1008), radius=160, fill=(24, 20, 44, 255), outline=(124, 58, 237, 255), width=24)
    big = sprite.resize((32 * 28, 32 * 28), Image.NEAREST)
    icon.alpha_composite(big, ((1024 - big.width) // 2, (1024 - big.height) // 2))
    icon.save(OUT)
    print(f'Ícone salvo em {OUT}')


if __name__ == '__main__':
    main()
