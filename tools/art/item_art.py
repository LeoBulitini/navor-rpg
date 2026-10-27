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


def pelt(base='#8a7868', dark='#64554a', light='#ab9a8a'):
    img = Img(32, 32)
    blob(img, 16, 18, 10, 6, hx(base), hx(dark), hx(light))
    for x, y in ((6, 13), (26, 13), (6, 23), (26, 23)):
        blob(img, x, y, 2, 2, hx(base), hx(dark))
    for x in (11, 15, 19):
        img.px(x, 17, hx(dark))
        img.px(x + 1, 19, hx(dark))
    outline(img)
    ground_shadow(img)
    return img


def fangs(cord='#7a4a2a', length=14, tips=((11, 9), (17, 7), (22, 11))):
    img = Img(32, 32)
    for cx, top in tips:
        for y in range(top, top + length):
            w = max(0, (top + length - y) // 4)
            for x in range(cx - w, cx + w + 1):
                img.px(x, y, P['f1'] if x <= cx else hx('#c8bfa8'))
    for x in range(8, 26):
        img.px(x, 24, hx(cord))
    outline(img)
    ground_shadow(img)
    return img


def log(bark, dark, ring, glow=None):
    """Tora de madeira deitada, com os anéis à mostra na ponta."""
    img = Img(32, 32)
    img.rect(6, 14, 18, 9, hx(bark))
    for x in range(6, 24, 3):
        img.px(x, 16, hx(dark)); img.px(x + 1, 20, hx(dark))
    img.rect(6, 22, 18, 1, hx(dark))
    blob(img, 24, 18, 3, 4, hx(ring), hx(dark))
    img.px(24, 18, hx(dark))
    if glow:
        for x, y in ((9, 13), (14, 12), (19, 13), (12, 23)):
            img.px(x, y, hx(glow))
    outline(img)
    ground_shadow(img)
    return img


def berries():
    img = Img(32, 32)
    for x, y in ((13, 18), (18, 17), (16, 21), (21, 21), (11, 22)):
        blob(img, x, y, 2, 2, hx('#b0284a'), hx('#7a1830'), hx('#e85a7a'))
    for x, y in ((15, 12), (16, 13), (17, 14), (14, 13)):
        img.px(x, y, P['g3'])
    outline(img)
    ground_shadow(img)
    return img


def herbs(leaf, dark, flower=None):
    img = Img(32, 32)
    for i, (x, h) in enumerate(((11, 10), (14, 14), (17, 12), (20, 9), (16, 7))):
        img.rect(x, 24 - h, 1, h, hx(dark))
        blob(img, x + (1 if i % 2 else -1), 24 - h + 2, 2, 1, hx(leaf), hx(dark))
        if flower:
            blob(img, x, 24 - h, 1, 1, hx(flower))
    outline(img)
    ground_shadow(img)
    return img


def flower(petal, dark, center):
    img = Img(32, 32)
    img.rect(16, 15, 1, 10, P['g2'])
    blob(img, 13, 20, 2, 1, P['g3'], P['g1'])
    for dx, dy in ((0, -4), (4, 0), (0, 4), (-4, 0)):
        blob(img, 16 + dx, 11 + dy, 2, 2, hx(petal), hx(dark))
    blob(img, 16, 11, 1, 1, hx(center))
    outline(img)
    ground_shadow(img)
    return img


def leather(base, dark):
    img = Img(32, 32)
    for y in range(11, 25):
        w = 9 - abs(y - 18) // 3
        for x in range(16 - w, 16 + w + 1):
            img.px(x, y, hx(base) if (x + y) % 7 else hx(dark))
    for x in range(9, 24, 2):
        img.px(x, 12, hx(dark))
    outline(img)
    ground_shadow(img)
    return img


def chitin():
    img = Img(32, 32)
    for i, (x, y) in enumerate(((10, 14), (17, 12), (14, 19), (21, 18))):
        blob(img, x, y, 4, 3, hx('#3d2a3a'), hx('#24161f'), hx('#7a5a75'))
    outline(img)
    ground_shadow(img)
    return img


def scroll(paper, ribbon):
    img = Img(32, 32)
    img.rect(9, 11, 14, 12, hx(paper))
    for y in range(13, 21, 2):
        img.rect(11, y, 10, 1, hx('#8a7a5a'))
    for x in (8, 23):
        img.rect(x, 9, 2, 16, hx('#c8b07a'))
        img.px(x, 9, hx('#e8d8aa'))
    img.rect(14, 22, 4, 3, hx(ribbon))
    outline(img)
    ground_shadow(img)
    return img


def meat():
    img = Img(32, 32)
    blob(img, 14, 18, 7, 5, hx('#b8433a'), hx('#7a2420'), hx('#e07a6a'))
    for x, y in ((11, 17), (14, 19), (16, 16)):
        img.px(x, y, hx('#f0d0c0'))
    img.rect(20, 17, 6, 2, P['f1'])
    blob(img, 26, 17, 2, 2, P['f1'], hx('#a89f8a'))
    outline(img)
    ground_shadow(img)
    return img


def vial(liquid, light):
    img = Img(32, 32)
    img.rect(14, 7, 4, 2, hx('#8a5a32'))  # rolha
    img.rect(14, 9, 4, 4, hx('#c8d3e0', 200))
    blob(img, 16, 18, 6, 6, hx('#c8d3e0', 200))
    blob(img, 16, 19, 5, 4, hx(liquid), None, hx(light))
    img.px(13, 15, hx('#ffffff'))
    outline(img)
    ground_shadow(img)
    return img


def silk():
    img = Img(32, 32)
    blob(img, 16, 18, 7, 6, hx('#ecebe6'), hx('#b8b6ae'), hx('#ffffff'))
    for i in range(12):
        img.px(10 + i, 14 + (i * 7) % 9, hx('#b8b6ae'))
    for x, y in ((23, 12), (24, 11), (25, 10)):
        img.px(x, y, hx('#ecebe6'))
    outline(img)
    ground_shadow(img)
    return img


def potion(liquid, light, big):
    """Frasco redondo de poção (o grande tem gargalo mais alto e brilho extra)."""
    img = Img(32, 32)
    r = 7 if big else 5
    top = 6 if big else 9
    img.rect(14, top, 4, 2, hx('#8a5a32'))  # rolha
    img.rect(14, top + 2, 4, 3, hx('#c8d3e0', 210))
    blob(img, 16, 25 - r, r, r, hx('#c8d3e0', 210))
    blob(img, 16, 26 - r, r - 1, r - 2, hx(liquid), None, hx(light))
    img.px(16 - r + 2, 23 - r, hx('#ffffff'))
    if big:
        img.px(17 - r + 2, 22 - r, hx('#ffffff'))
    outline(img)
    ground_shadow(img)
    return img


def bread():
    img = Img(32, 32)
    blob(img, 16, 19, 10, 5, hx('#c8893a'), hx('#8a5a22'), hx('#e8b46a'))
    for x in (11, 16, 21):
        img.px(x, 17, hx('#f5e0b0')); img.px(x + 1, 16, hx('#f5e0b0'))
    outline(img)
    ground_shadow(img)
    return img


def roast():
    img = Img(32, 32)
    blob(img, 14, 18, 8, 6, hx('#8a4a22'), hx('#5a2a12'), hx('#b8703a'))
    for x, y in ((10, 16), (13, 19), (17, 15)):
        img.px(x, y, hx('#e0a060'))
    img.rect(21, 15, 6, 2, P['f1'])
    blob(img, 27, 15, 2, 2, P['f1'], hx('#a89f8a'))
    outline(img)
    ground_shadow(img)
    return img


def pie():
    img = Img(32, 32)
    blob(img, 16, 20, 10, 4, hx('#c8893a'), hx('#8a5a22'))
    blob(img, 16, 18, 9, 3, hx('#b0284a'), hx('#7a1830'), hx('#e85a7a'))
    for x in range(8, 25, 3):
        img.px(x, 17, hx('#e8b46a')); img.px(x + 1, 19, hx('#e8b46a'))
    outline(img)
    ground_shadow(img)
    return img


def line(img, x0, y0, x1, y1, c, w=1):
    """Linha reta de (x0, y0) a (x1, y1) com espessura w."""
    n = max(abs(x1 - x0), abs(y1 - y0), 1)
    for i in range(n + 1):
        x = round(x0 + (x1 - x0) * i / n)
        y = round(y0 + (y1 - y0) * i / n)
        img.rect(x, y, w, w, c)


def handle(img, top=(20, 8), bottom=(9, 26)):
    line(img, *top, *bottom, hx('#7a5230'), 2)
    line(img, top[0] + 1, top[1], bottom[0] + 1, bottom[1], hx('#4a2e19'))


def pickaxe(head, dark):
    img = Img(32, 32)
    handle(img)
    line(img, 10, 9, 20, 5, hx(head), 2)
    line(img, 20, 5, 27, 11, hx(head), 2)
    img.px(10, 10, hx(dark)); img.px(27, 12, hx(dark))
    outline(img)
    ground_shadow(img)
    return img


def axe(head, dark):
    img = Img(32, 32)
    handle(img)
    for y in range(4, 17):
        w = 6 - abs(y - 10) // 2
        img.rect(20, y, w, 1, hx(head) if y < 14 else hx(dark))
        img.px(19 + w, y, hx('#f1f5f9'))
    img.rect(17, 8, 3, 4, hx(dark))
    outline(img)
    ground_shadow(img)
    return img


def sword(blade, light, hilt):
    img = Img(32, 32)
    line(img, 10, 22, 24, 7, hx(blade), 2)
    line(img, 11, 21, 24, 8, hx(light))
    line(img, 7, 19, 13, 25, hx(hilt), 2)
    line(img, 9, 23, 6, 26, hx('#4a2e19'), 2)
    outline(img)
    ground_shadow(img)
    return img


def staff(wood, gem, glow):
    img = Img(32, 32)
    line(img, 9, 27, 21, 9, hx(wood), 2)
    blob(img, 22, 7, 3, 3, hx(gem), None, hx(glow))
    img.px(19, 7, hx(wood)); img.px(25, 9, hx(wood))
    outline(img)
    ground_shadow(img)
    return img


def bow(wood, dark):
    img = Img(32, 32)
    for i in range(19):
        y = 6 + i
        x = 11 + round(6 * (1 - ((i - 9) / 9.5) ** 2))
        img.rect(x, y, 2, 1, hx(wood) if i % 5 else hx(dark))
    line(img, 12, 6, 12, 24, hx('#ecebe6'))
    line(img, 12, 15, 25, 15, hx('#c8b07a'))
    img.rect(24, 14, 2, 3, P['s3'])
    outline(img)
    ground_shadow(img)
    return img


def shield(face, rim, boss):
    img = Img(32, 32)
    for y in range(7, 26):
        w = 8 if y < 18 else 8 - (y - 18)
        for x in range(16 - w, 16 + w + 1):
            edge = abs(x - 16) >= w - 1 or y == 7
            img.px(x, y, hx(rim) if edge else hx(face))
    blob(img, 16, 15, 2, 2, hx(boss))
    outline(img)
    ground_shadow(img)
    return img


def helmet(base, dark):
    img = Img(32, 32)
    blob(img, 16, 16, 8, 7, hx(base), hx(dark))
    img.rect(8, 20, 17, 3, hx(dark))
    img.rect(11, 17, 11, 2, OL)
    outline(img)
    ground_shadow(img)
    return img


def chestplate(base, dark, light):
    img = Img(32, 32)
    img.rect(10, 9, 13, 15, hx(base))
    img.rect(6, 9, 5, 6, hx(base)); img.rect(22, 9, 5, 6, hx(base))
    img.rect(13, 8, 7, 3, OL)
    img.rect(11, 22, 11, 2, hx(dark))
    line(img, 16, 12, 16, 21, hx(dark))
    img.rect(11, 11, 2, 4, hx(light))
    outline(img)
    ground_shadow(img)
    return img


def gloves(base, dark):
    img = Img(32, 32)
    for cx in (11, 21):
        img.rect(cx - 4, 12, 8, 9, hx(base))
        img.rect(cx - 4, 20, 8, 3, hx(dark))
        img.rect(cx + 4, 15, 2, 4, hx(base))
    outline(img)
    ground_shadow(img)
    return img


def pants(base, dark):
    img = Img(32, 32)
    img.rect(9, 8, 15, 4, hx(dark))
    img.rect(9, 12, 7, 13, hx(base)); img.rect(17, 12, 7, 13, hx(base))
    outline(img)
    ground_shadow(img)
    return img


def boots(base, dark):
    img = Img(32, 32)
    for x0 in (7, 18):
        img.rect(x0 + 1, 9, 5, 12, hx(base))
        img.rect(x0 + 1, 19, 8, 4, hx(base))
        img.rect(x0 + 1, 22, 8, 2, hx(dark))
        img.rect(x0 + 1, 9, 5, 2, hx(dark))
    outline(img)
    ground_shadow(img)
    return img


def ring(metal, gem):
    img = Img(32, 32)
    for y in range(12, 26):
        for x in range(9, 24):
            d = ((x - 16) / 6.5) ** 2 + ((y - 19) / 6) ** 2
            if 0.45 <= d <= 1:
                img.px(x, y, hx(metal))
    blob(img, 16, 12, 2, 2, hx(gem), None, hx('#ffffff'))
    outline(img)
    ground_shadow(img)
    return img


def amulet(cord, charm, dark):
    img = Img(32, 32)
    for i in range(15):
        x = 9 + i
        y = 7 + round(9 * (1 - ((i - 7) / 7.5) ** 2))
        img.px(x, y, hx(cord))
    for x, y in ((12, 17), (16, 19), (20, 17)):
        line(img, x, y, x, y + 5, hx(charm), 2)
        img.px(x, y + 5, hx(dark))
    outline(img)
    ground_shadow(img)
    return img


ROCK = (P['s2'], P['s1'], P['s3'])
def scale_icon(base, dark, light):
    """Escama grande em forma de gota, com nervuras."""
    img = Img(32, 32)
    for y in range(6, 27):
        half = int(9 * ((y - 6) / 20) ** 0.6) if y < 22 else int(9 * (1 - (y - 22) / 5))
        for x in range(16 - half, 16 + half + 1):
            d = (x - 16) + (y - 16)
            img.px(x, y, hx(light) if d < -6 else hx(base) if d < 6 else hx(dark))
    for y in range(10, 24, 4):
        for x in range(12, 21):
            if img.im.getpixel((x, y))[3]:
                img.px(x, y, hx(dark))
    img.rect(16, 8, 1, 16, hx(light))
    outline(img)
    ground_shadow(img)
    return img


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
    'rat-pelt': pelt,
    'goblin-fangs': fangs,
    'bat-chitin': chitin,
    'wood-common': lambda: log('#7a5230', '#4a2e19', '#d9b27a'),
    'wood-sturdy': lambda: log('#5f3d22', '#2a160b', '#b08050'),
    'wood-ancient': lambda: log('#4a4a3a', '#22221a', '#c8c08a', glow='#9cd0ff'),
    'wild-berries': berries,
    'medicinal-herbs': lambda: herbs('#5aa05a', '#2f6a36', '#e8f5c8'),
    'blue-flower': lambda: flower('#4a8fe0', '#2a5aa8', '#f3d27a'),
    'leather-simple': lambda: leather('#a0703f', '#6e4a28'),
    'boar-tusks': lambda: fangs('#3d2a1f', 12, ((12, 10), (20, 10))),
    'wolf-pelt': lambda: pelt('#7d8089', '#4f525a', '#a8abb3'),
    'wolf-fangs': lambda: fangs('#4f525a'),
    'rabbit-pelt': lambda: pelt('#ddd0bc', '#86735e', '#f5f0e8'),
    'bear-pelt': lambda: pelt('#5a3a22', '#3a2414', '#7a5434'),
    'bear-fangs': lambda: fangs('#5a3a22', 16, ((10, 6), (16, 5), (22, 6))),
    'meat': meat,
    'spider-venom': lambda: vial('#5ab84a', '#a8f07a'),
    'spider-silk': silk,
    'scroll-simple': lambda: scroll('#e8dcc0', '#9ca3af'),
    'scroll-improved': lambda: scroll('#e8dcc0', '#22c55e'),
    'potion-health-small': lambda: potion('#d03a3a', '#ff8a8a', False),
    'potion-health': lambda: potion('#d03a3a', '#ff8a8a', True),
    'potion-mana-small': lambda: potion('#3a6ad0', '#8ab4ff', False),
    'potion-mana': lambda: potion('#3a6ad0', '#8ab4ff', True),
    'bread': bread,
    'roast-meat': roast,
    'berry-pie': pie,
    'pickaxe-iron': lambda: pickaxe('#9ca3af', '#4b5563'),
    'pickaxe-silver': lambda: pickaxe('#e6e8ec', '#8b93a1'),
    'axe-iron': lambda: axe('#9ca3af', '#4b5563'),
    'axe-steel': lambda: axe('#cbd5e1', '#475569'),
    'sword-short': lambda: sword('#9ca3af', '#d1d5db', '#7a5230'),
    'sword-iron': lambda: sword('#b8c0cc', '#f1f5f9', '#a16207'),
    'staff-apprentice': lambda: staff('#7a5230', '#a78bfa', '#ede9fe'),
    'staff-crystal': lambda: staff('#5f3d22', '#4a8fe0', '#9cd0ff'),
    'bow-short': lambda: bow('#a0703f', '#6e4a28'),
    'bow-sturdy': lambda: bow('#5f3d22', '#2a160b'),
    'shield-wood': lambda: shield('#a0703f', '#6b7280', '#d1d5db'),
    'helmet-leather': lambda: helmet('#a0703f', '#6e4a28'),
    'chest-leather': lambda: chestplate('#a0703f', '#6e4a28', '#c8935a'),
    'chest-iron': lambda: chestplate('#9ca3af', '#4b5563', '#e5e7eb'),
    'gloves-leather': lambda: gloves('#a0703f', '#6e4a28'),
    'pants-leather': lambda: pants('#8a5a32', '#5a3a1f'),
    'boots-leather': lambda: boots('#7a4a2a', '#4a2e19'),
    'ring-silver': lambda: ring('#e6e8ec', '#4a8fe0'),
    'amulet-fangs': lambda: amulet('#7a4a2a', '#f5f0e8', '#a89f8a'),
    'dragon-scale': lambda: scale_icon('#b8321e', '#6e1a10', '#f07a3a'),
    'monster-essence': lambda: vial('#7a3ab8', '#c8a0f0'),
    'scroll-rare': lambda: scroll('#e8dcc0', '#3b82f6'),
    'scroll-ancient': lambda: scroll('#d8c8a0', '#a855f7'),
    'mithril': lambda: ore(ROCK, [hx('#b8e0e8'), hx('#7ab8c8'), hx('#ffffff')], 7),
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
