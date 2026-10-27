"""Sprites provisórios dos monstros, animais, baú e efeitos de ataque, desenhados por código (pixel art).

Gera:
  apps/web/public/assets/creatures/<sprite>.png  tira 64x32: quadro 0 parado, quadro 1 andando.
                                                 Desenhado virado para a direita; o jogo espelha.
  apps/web/public/assets/effects/<sprite>.png    efeitos de ataque (16x16 ou 32x32) e o baú (32x32)

É arte de trabalho: para trocar, substitua os PNGs pelos definitivos com o mesmo nome e tamanho.
Requer Python 3 e Pillow (pip install pillow). Uso: python3 tools/art/creature_art.py
"""
import json
import os

from city_art import P, ROOT, Img, hx
from item_art import blob, ground_shadow, outline

PUBLIC = os.path.join(ROOT, 'apps', 'web', 'public', 'assets')
OL = P['ol']


def rat(step):
    img = Img(32, 32)
    fur, dark, light = hx('#7a6a5c'), hx('#544638'), hx('#a39282')
    bob = 1 if step else 0
    # cauda
    for i, (x, y) in enumerate(((4, 20), (5, 21), (6, 21), (7, 21), (8, 20), (3, 19), (2, 18))):
        img.px(x, y + bob, hx('#c89a8a'))
    blob(img, 15, 20 + bob, 7, 4, fur, dark, light)
    blob(img, 22, 19 + bob, 4, 3, fur, dark, light)
    img.px(26, 19 + bob, hx('#c89a8a'))  # focinho
    img.px(27, 19 + bob, hx('#c89a8a'))
    img.px(23, 18 + bob, P['r1'])  # olho
    blob(img, 20, 15 + bob, 1, 1, hx('#c89a8a'))  # orelha
    for x in ((11, 18) if step else (12, 19)):
        img.rect(x, 24, 1, 2, dark)
    outline(img)
    ground_shadow(img, 16, 27, 8)
    return img


def goblin(step):
    img = Img(32, 32)
    skin, skin_d, skin_l = hx('#6aa84f'), hx('#3f7a2e'), hx('#94d07a')
    cloth, cloth_d = hx('#7a4a2a'), hx('#56331c')
    bob = 1 if step else 0
    # pernas
    for x, h in ((13, 5 - bob), (17, 4 + bob)) if step else ((13, 5), (17, 5)):
        img.rect(x, 22, 2, h, skin_d)
    # corpo (túnica)
    img.rect(11, 14 + bob, 10, 9, cloth)
    img.rect(11, 20 + bob, 10, 2, cloth_d)
    img.rect(11, 18 + bob, 10, 1, hx('#3a2a1a'))  # cinto
    # cabeça
    blob(img, 16, 9 + bob, 5, 4, skin, skin_d, skin_l)
    for x, y in ((9, 7), (10, 8), (22, 7), (21, 8)):  # orelhas pontudas
        img.px(x, y + bob, skin)
    img.px(18, 8 + bob, P['y'])
    img.px(19, 8 + bob, P['y'])
    img.px(17, 11 + bob, P['f1'])  # presa
    # braço com porrete
    img.rect(21, 15 + bob, 2, 5, skin)
    img.rect(23, 10 + bob, 2, 9, hx('#8a5a32'))
    img.rect(22, 9 + bob, 4, 3, hx('#6a4224'))
    outline(img)
    ground_shadow(img, 16, 28, 7)
    return img


def quadruped(step, body, dark, light, size=1.0, legs_h=4, head=None, extra=None):
    """Bicho de quatro patas visto de lado (virado para a direita). `size` escala o corpo."""
    img = Img(32, 32)
    bob = 1 if step else 0
    rx, ry = round(8 * size), round(4 * size)
    cx, cy = 15, 24 - legs_h - ry
    # patas: duas da frente e duas de trás, alternando no passo
    for i, x in enumerate((cx - rx + 2, cx - rx + 4, cx + rx - 4, cx + rx - 2)):
        h = legs_h - (1 if (i % 2) == step else 0)
        img.rect(x, cy + ry - 1, 1 + (size > 1.2), h + 1, dark)
    blob(img, cx, cy - bob, rx, ry, body, dark, light)
    if head:
        head(img, cx + rx, cy - bob)
    if extra:
        extra(img, cx, cy - bob, rx, ry)
    outline(img)
    ground_shadow(img, 16, 27, max(6, rx))
    return img


def deer(step):
    fur, dark, light = hx('#a0703f'), hx('#6e4a28'), hx('#c99a62')

    def head(img, x, y):
        img.rect(x - 1, y - 7, 3, 6, fur)  # pescoço
        blob(img, x + 2, y - 8, 3, 2, fur, dark, light)
        img.px(x + 5, y - 8, P['ol'])  # focinho
        img.px(x + 2, y - 9, P['ol'])  # olho
        for ax, ay in ((x, y - 11), (x - 1, y - 12), (x + 1, y - 13), (x - 2, y - 14), (x + 2, y - 12), (x + 3, y - 14)):
            img.px(ax, ay, hx('#d9c8a8'))  # chifres

    def extra(img, cx, cy, rx, ry):
        img.px(cx - rx, cy - 1, hx('#f0e6d6'))  # rabinho branco
        for x in (cx - 3, cx, cx + 3):
            img.px(x, cy - 1, light)

    return quadruped(step, fur, dark, light, 1.0, 6, head, extra)


def rabbit(step):
    fur, dark, light = hx('#b8a48c'), hx('#86735e'), hx('#ddd0bc')
    img = Img(32, 32)
    bob = 2 if step else 0
    blob(img, 14, 22 - bob, 5, 4, fur, dark, light)
    blob(img, 19, 19 - bob, 3, 3, fur, dark, light)
    img.rect(18, 12 - bob, 1, 5, fur)  # orelhas
    img.rect(20, 12 - bob, 1, 5, light)
    img.px(20, 19 - bob, P['ol'])
    img.px(9, 21 - bob, hx('#f5f0e8'))  # rabinho
    img.rect(16, 25, 3, 1, dark)
    outline(img)
    ground_shadow(img, 15, 27, 6)
    return img


def squirrel(step):
    fur, dark, light = hx('#b4612a'), hx('#7e3f18'), hx('#e08a4a')
    img = Img(32, 32)
    bob = 1 if step else 0
    blob(img, 10, 17 - bob, 4, 6, fur, dark, light)  # cauda
    blob(img, 16, 22 - bob, 4, 3, fur, dark, light)
    blob(img, 20, 19 - bob, 2, 2, fur, dark, light)
    img.px(21, 16 - bob, fur)
    img.px(21, 19 - bob, P['ol'])
    outline(img)
    ground_shadow(img, 16, 27, 5)
    return img


def wolf(step):
    fur, dark, light = hx('#7d8089'), hx('#4f525a'), hx('#a8abb3')

    def head(img, x, y):
        blob(img, x + 1, y - 3, 4, 3, fur, dark, light)
        img.rect(x + 4, y - 2, 3, 2, fur)  # focinho
        img.px(x + 6, y - 2, P['ol'])
        img.px(x + 2, y - 4, P['y'])  # olho amarelo
        img.px(x - 1, y - 7, fur); img.px(x, y - 7, fur); img.px(x, y - 8, dark)  # orelha

    def extra(img, cx, cy, rx, ry):
        for i in range(5):  # cauda
            img.px(cx - rx - 1 - i, cy - 1 + i // 2, dark)

    return quadruped(step, fur, dark, light, 1.1, 5, head, extra)


def boar(step):
    fur, dark, light = hx('#5e4232'), hx('#3d2a1f'), hx('#7e5a44')

    def head(img, x, y):
        blob(img, x + 1, y + 1, 4, 3, fur, dark, light)
        img.rect(x + 4, y + 1, 2, 2, hx('#c98a7a'))  # focinho
        img.px(x + 4, y - 1, hx('#f0e6d6')); img.px(x + 5, y - 2, hx('#f0e6d6'))  # presa
        img.px(x + 1, y - 1, P['r3'])  # olho

    def extra(img, cx, cy, rx, ry):
        for x in range(cx - rx + 2, cx + rx - 1, 2):  # crina
            img.px(x, cy - ry, P['ol'])

    return quadruped(step, fur, dark, light, 1.15, 3, head, extra)


def bear(step):
    fur, dark, light = hx('#5a3a22'), hx('#3a2414'), hx('#7a5434')

    def head(img, x, y):
        blob(img, x, y - 3, 4, 4, fur, dark, light)
        img.rect(x + 3, y - 2, 2, 2, hx('#a07a54'))
        img.px(x + 4, y - 2, P['ol'])
        img.px(x + 1, y - 4, P['ol'])
        blob(img, x - 2, y - 7, 1, 1, fur, dark)  # orelha

    return quadruped(step, fur, dark, light, 1.6, 4, head)


def dragon(step):
    """Dragão vermelho de lado (virado para a direita), asas abertas. O jogo desenha em escala 2."""
    img = Img(32, 32)
    body, dark, light = hx('#b8321e'), hx('#6e1a10'), hx('#e0603a')
    belly = hx('#e8b05a')
    bob = 1 if step else 0
    # cauda
    for i, (x, y) in enumerate(((3, 22), (4, 21), (5, 21), (6, 20), (7, 20), (8, 20), (2, 23), (1, 24))):
        img.px(x, y + bob, body if i < 6 else dark)
    img.px(1, 25 + bob, light)
    # asa de trás (sobe e desce com o passo)
    wing_y = 4 if step else 6
    for x in range(9, 20):
        top = wing_y + abs(x - 14) // 2
        for y in range(top, 16):
            img.px(x, y, dark if (x + y) % 4 else hx('#4a120a'))
    # pernas
    for x in ((10, 18) if step else (11, 19)):
        img.rect(x, 22, 2, 4, dark)
        img.px(x + 2, 25, P['f1'])
    # corpo e barriga
    blob(img, 14, 19 + bob, 7, 4, body, dark, light)
    img.rect(10, 21 + bob, 9, 1, belly)
    # pescoço e cabeça
    for i in range(5):
        blob(img, 20 + i, 16 - i + bob, 2, 2, body, dark, light)
    blob(img, 26, 10 + bob, 3, 2, body, dark, light)
    img.rect(28, 10 + bob, 3, 2, body)
    img.px(30, 11 + bob, hx('#ffd36a'))  # bafo de fogo
    img.px(27, 9 + bob, hx('#ffd36a'))  # olho
    img.px(24, 7 + bob, P['f1'])  # chifres
    img.px(23, 6 + bob, P['f1'])
    # asa da frente
    for x in range(12, 22):
        top = wing_y + 2 + abs(x - 17) // 2
        for y in range(top, top + 4):
            img.px(x, y, body if y > top else light)
    outline(img)
    ground_shadow(img, 16, 28, 10)
    return img


def spider(step):
    body, dark, light = hx('#2d2624'), hx('#120f10'), hx('#52463f')
    img = Img(32, 32)
    for i, (dx, dy) in enumerate(((-9, -3), (-10, 1), (-9, 5), (-7, 8))):
        k = 1 if (i % 2) == step else 0
        for side in (-1, 1):
            x0, y0 = 16, 18
            x1, y1 = 16 + side * (-dx), y0 + dy - k
            for t in range(9):
                img.px(round(x0 + (x1 - x0) * t / 8), round(y0 - 3 + (y1 - y0 + 3) * t / 8), dark)
    blob(img, 13, 19, 6, 5, body, dark, light)
    blob(img, 20, 18, 3, 3, body, dark, light)
    for x, y in ((21, 17), (22, 17), (21, 19)):
        img.px(x, y, P['r3'])  # olhos
    img.px(11, 17, hx('#b91c1c'))  # marca vermelha
    img.px(12, 18, hx('#b91c1c'))
    outline(img)
    ground_shadow(img, 16, 27, 9)
    return img


def bat(step):
    body, dark, light = hx('#3d2a3a'), hx('#24161f'), hx('#5a4255')
    img = Img(32, 32)
    up = step == 1
    blob(img, 16, 13, 3, 3, body, dark, light)
    for side in (-1, 1):
        for i in range(10):
            y = 12 - (i // 2 if up else -i // 3)
            img.rect(16 + side * (3 + i), y, 1, 3 if i < 8 else 2, dark if i % 3 == 0 else body)
    img.px(15, 12, P['r3']); img.px(17, 12, P['r3'])
    img.px(14, 9, body); img.px(18, 9, body)  # orelhas
    outline(img)
    ground_shadow(img, 16, 27, 4)  # voa: sombra pequena e longe
    return img


def skeleton(step):
    bone, dark = hx('#d9d3c2'), hx('#9c9480')
    img = Img(32, 32)
    bob = 1 if step else 0
    for x, h in ((14, 6 - bob), (18, 5 + bob)):  # pernas
        img.rect(x, 21, 1, h, bone)
    img.rect(13, 20, 7, 1, dark)  # bacia
    img.rect(16, 13 + bob, 1, 7, bone)  # coluna
    for y in (14, 16, 18):  # costelas
        img.rect(13, y + bob, 7, 1, bone)
        img.px(16, y + bob, dark)
    blob(img, 16, 9 + bob, 4, 4, bone, dark)
    img.rect(14, 9 + bob, 2, 2, P['ol']); img.rect(18, 9 + bob, 2, 2, P['ol'])  # olhos
    img.px(15, 9 + bob, P['r3'])
    img.rect(15, 12 + bob, 3, 1, P['ol'])
    img.rect(20, 14 + bob, 1, 5, bone)  # braço com espada velha
    img.rect(21, 5 + bob, 1, 11, hx('#8a8f98'))
    img.rect(20, 15 + bob, 3, 1, hx('#6a4224'))
    img.rect(11, 14 + bob, 1, 5, bone)
    outline(img)
    ground_shadow(img, 16, 28, 6)
    return img


def chest(opened):
    """Baú 32x32 visto de frente-cima (fechado ou aberto)."""
    img = Img(32, 32)
    wood, dark, light, metal = P['k3'], P['k1'], P['k4'], P['y']
    img.rect(6, 15, 20, 11, wood)
    img.rect(6, 15, 20, 1, light)
    img.rect(6, 25, 20, 1, dark)
    for x in (6, 15, 16, 25):
        img.rect(x, 15, 1, 11, dark)
    if opened:
        img.rect(7, 16, 18, 4, P['ol'])
        for x in (10, 13, 17, 21):
            img.px(x, 17, P['y2']); img.px(x + 1, 18, metal)
        img.rect(6, 7, 20, 7, wood)  # tampa levantada
        img.rect(6, 7, 20, 1, light)
        img.rect(6, 13, 20, 1, dark)
    else:
        img.rect(6, 10, 20, 5, wood)
        img.rect(6, 10, 20, 1, light)
        img.rect(6, 14, 20, 1, dark)
        img.rect(15, 13, 3, 4, metal)  # fecho
        img.px(16, 15, P['ol'])
    for x in (7, 24):
        img.rect(x, 10 if not opened else 15, 1, 16 if not opened else 11, metal)
    outline(img)
    ground_shadow(img, 16, 28, 11)
    return img


def bolt():
    img = Img(16, 16)
    blob(img, 8, 8, 5, 5, hx('#7c3aed', 110))
    blob(img, 8, 8, 3, 3, hx('#a78bfa'))
    blob(img, 8, 8, 1, 1, hx('#f5f3ff'))
    return img


def arrow():
    img = Img(16, 16)
    for x in range(2, 12):
        img.px(x, 8, hx('#8a5a32'))
    for x, y in ((12, 8), (11, 7), (11, 9), (13, 8), (10, 6), (10, 10)):
        img.px(x, y, hx('#c8ccd4'))
    for x, y in ((2, 7), (3, 6), (2, 9), (3, 10), (1, 7), (1, 9)):
        img.px(x, y, hx('#e5e7eb'))
    return img


def slash():
    """Arco de golpe virado para a direita (o jogo gira conforme a direção)."""
    import math
    img = Img(32, 32)
    for i in range(-50, 51, 2):
        a = math.radians(i)
        for r, c in ((11, hx('#ffffff', 230)), (12, hx('#dbeafe', 200)), (13, hx('#93c5fd', 140))):
            img.px(round(10 + r * math.cos(a)), round(16 + r * math.sin(a)), c)
    return img


def strip(frames):
    out = Img(32 * len(frames), 32)
    for i, f in enumerate(frames):
        out.paste(f, 32 * i, 0)
    return out


CREATURES = {
    'cave-rat': lambda: strip([rat(0), rat(1)]),
    'goblin-raider': lambda: strip([goblin(0), goblin(1)]),
    'cave-bat': lambda: strip([bat(0), bat(1)]),
    'ancient-skeleton': lambda: strip([skeleton(0), skeleton(1)]),
    'deer': lambda: strip([deer(0), deer(1)]),
    'rabbit': lambda: strip([rabbit(0), rabbit(1)]),
    'squirrel': lambda: strip([squirrel(0), squirrel(1)]),
    'wolf': lambda: strip([wolf(0), wolf(1)]),
    'wild-boar': lambda: strip([boar(0), boar(1)]),
    'bear': lambda: strip([bear(0), bear(1)]),
    'giant-spider': lambda: strip([spider(0), spider(1)]),
    'dragon': lambda: strip([dragon(0), dragon(1)]),
}
EFFECTS = {'arcane-bolt': bolt, 'arrow': arrow, 'slash': slash, 'chest': lambda: chest(False), 'chest-open': lambda: chest(True)}
# Efeitos que o jogo usa sempre, além dos ataques de combat.json.
ALWAYS = {'chest', 'chest-open'}


def main():
    with open(os.path.join(ROOT, 'content', 'creatures.json'), encoding='utf8') as f:
        wanted = {c['sprite'] for c in json.load(f)['creatures']}
    with open(os.path.join(ROOT, 'content', 'combat.json'), encoding='utf8') as f:
        effects = {a['sprite'] for a in json.load(f)['basicAttacks'].values()} | ALWAYS
    for kind, have in (('monstros', wanted - CREATURES.keys()), ('efeitos', effects - EFFECTS.keys())):
        if have:
            raise SystemExit(f'Sem desenho para {kind}: {", ".join(sorted(have))}')
    for folder, table, names in (('creatures', CREATURES, wanted), ('effects', EFFECTS, effects)):
        os.makedirs(os.path.join(PUBLIC, folder), exist_ok=True)
        for name in sorted(names):
            table[name]().im.save(os.path.join(PUBLIC, folder, f'{name}.png'))
    print(f'{len(wanted)} monstros e {len(effects)} efeito(s) gerados em {PUBLIC}')


if __name__ == '__main__':
    main()
