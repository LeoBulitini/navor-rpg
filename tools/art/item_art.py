"""Ícones provisórios dos itens do Navor, desenhados por código (pixel art 32x32).

Gera apps/web/public/assets/items/<icon>.png para cada 'icon' de content/items.json, mais o
genérico 'unknown'. O mesmo ícone aparece no chão da Gruta (ponto de coleta) e no inventário.
É arte de trabalho: para trocar, substitua os PNGs pelos definitivos com o mesmo nome e tamanho.

Requer Python 3 e Pillow (pip install pillow). Uso: python3 tools/art/item_art.py
"""
import json
import os
import random

from city_art import P, ROOT, Img, hx

OUT = os.path.join(ROOT, 'apps', 'web', 'public', 'assets', 'items')
OL = P['ol']


def outline(img):
    """Contorno escuro de 1 px em volta de tudo que foi desenhado."""
    src = img.im.copy()
    for y in range(img.h):
        for x in range(img.w):
            if src.getpixel((x, y))[3] > 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < img.w and 0 <= ny < img.h and src.getpixel((nx, ny))[3] > 0:
                    img.im.putpixel((x, y), OL)
                    break


def ground_shadow(img, cx=16, cy=27, rx=9):
    for x in range(cx - rx, cx + rx + 1):
        for y in (cy, cy + 1):
            img.px(x, y, (0, 0, 0, 90))


def blob(img, cx, cy, rx, ry, color, shade=None, light=None):
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            if ((x - cx) / (rx + 0.5)) ** 2 + ((y - cy) / (ry + 0.5)) ** 2 <= 1:
                c = color
                if shade and (y - cy) > ry * 0.35:
                    c = shade
                if light and (y - cy) < -ry * 0.4 and (x - cx) < 0:
                    c = light
                img.px(x, y, c)


def ore(rock, flecks, seed):
    """Pedra com veios coloridos: rock = (base, sombra, luz); flecks = cores dos veios."""
    rng = random.Random(seed)
    img = Img(32, 32)
    blob(img, 16, 19, 10, 7, rock[0], rock[1], rock[2])
    blob(img, 11, 15, 5, 4, rock[0], None, rock[2])
    for _ in range(14):
        x, y = rng.randrange(8, 25), rng.randrange(12, 25)
        if img.im.getpixel((x, y))[3] and img.im.getpixel((x + 1, y))[3]:
            c = rng.choice(flecks)
            img.px(x, y, c)
            img.px(x + 1, y, c)
    outline(img)
    ground_shadow(img)
    return img


def crystal(base, dark, light):
    img = Img(32, 32)
    # três prismas: centro alto, laterais menores
    for cx, top, half, h in ((16, 4, 3, 20), (10, 11, 2, 13), (22, 12, 2, 12)):
        for y in range(top, top + h):
            w = half if y > top + 2 else max(0, y - top)
            for x in range(cx - w, cx + w + 1):
                c = light if x < cx else (base if x == cx else dark)
                img.px(x, y, c)
    for x in range(8, 25):
        img.px(x, 24, P['s1'])
    outline(img)
    ground_shadow(img)
    return img


def mushroom(cap, cap_dark, spots, stem=P['f1']):
    img = Img(32, 32)
    img.rect(14, 16, 4, 9, stem)
    img.rect(17, 16, 1, 9, P['d4'])
    blob(img, 16, 13, 9, 5, cap, cap_dark)
    for x in range(7, 26):
        img.px(x, 17, cap_dark)
    for sx, sy in ((12, 11), (19, 10), (16, 14), (22, 13)):
        img.px(sx, sy, spots)
        img.px(sx + 1, sy, spots)
    # cogumelo menor ao lado
    img.rect(23, 21, 2, 4, stem)
    blob(img, 24, 20, 3, 2, cap, cap_dark)
    outline(img)
    ground_shadow(img)
    return img


def bones(color, dark):
    img = Img(32, 32)

    def bone(x0, y0, x1, y1):
        steps = max(abs(x1 - x0), abs(y1 - y0))
        for i in range(steps + 1):
            x = round(x0 + (x1 - x0) * i / steps)
            y = round(y0 + (y1 - y0) * i / steps)
            img.rect(x, y, 2, 2, color)
            img.px(x + 1, y + 1, dark)
        for ex, ey in ((x0, y0), (x1, y1)):
            blob(img, ex, ey, 2, 2, color, dark)

    bone(8, 10, 23, 23)
    bone(23, 10, 8, 23)
    outline(img)
    ground_shadow(img)
    return img


def big_bone(color, dark):
    img = Img(32, 32)
    for x in range(9, 24):
        img.rect(x, 15, 1, 4, color)
        img.px(x, 18, dark)
    for ex in (8, 24):
        blob(img, ex, 14, 3, 2, color, dark)
        blob(img, ex, 19, 3, 2, color, dark)
    for x in (12, 16, 20):
        img.px(x, 16, dark)
    outline(img)
    ground_shadow(img)
    return img


def unknown():
    img = Img(32, 32)
    blob(img, 16, 18, 8, 7, P['k3'], P['k2'], P['k4'])
    img.rect(13, 9, 6, 3, P['k2'])
    for x, y in ((15, 14), (16, 14), (17, 15), (16, 16), (16, 17), (16, 20)):
        img.px(x, y, P['y2'])
    outline(img)
    ground_shadow(img)
    return img


ROCK = (P['s2'], P['s1'], P['s3'])
ICONS = {
    'iron': lambda: ore(ROCK, [hx('#b5651d'), hx('#8a4b1a')], 1),
    'copper': lambda: ore(ROCK, [hx('#e08a4a'), hx('#c46a2a'), hx('#3fa38a')], 2),
    'coal': lambda: ore((P['c2'], P['c1'], P['c4']), [P['c0'], hx('#0a0a0a')], 3),
    'silver': lambda: ore(ROCK, [hx('#e6e8ec'), hx('#c3c7cf')], 4),
    'aluminum': lambda: ore(ROCK, [hx('#c8d3e0'), hx('#9fb2c8')], 5),
    'gold-ore': lambda: ore(ROCK, [P['y'], P['y2']], 6),
    'quartz': lambda: crystal(hx('#e9dff0'), hx('#b9a8c9'), hx('#ffffff')),
    'crystal-blue': lambda: crystal(hx('#4a8fe0'), hx('#2a5aa8'), hx('#9cd0ff')),
    'mushroom-common': lambda: mushroom(P['r3'], P['r1'], P['f1']),
    'mushroom-medicinal': lambda: mushroom(hx('#5aa05a'), hx('#2f6a36'), hx('#e8f5c8')),
    'bones': lambda: bones(P['f1'], hx('#a89f8a')),
    'ancient-bone': lambda: big_bone(hx('#d8c48a'), hx('#9c8a52')),
    'unknown': unknown,
}


def main():
    with open(os.path.join(ROOT, 'content', 'items.json'), encoding='utf8') as f:
        wanted = {i['icon'] for i in json.load(f)['items'] if 'icon' in i} | {'unknown'}
    missing = wanted - ICONS.keys()
    if missing:
        raise SystemExit(f'Sem desenho para os ícones: {", ".join(sorted(missing))}')
    os.makedirs(OUT, exist_ok=True)
    for name in sorted(wanted):
        ICONS[name]().im.save(os.path.join(OUT, f'{name}.png'))
    print(f'{len(wanted)} ícones gerados em {OUT}')


if __name__ == '__main__':
    main()
