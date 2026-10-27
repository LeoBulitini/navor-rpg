"""Arte provisória da cidade do Navor, desenhada por código (pixel art 32x32).

Gera apps/web/public/assets/city/terrain.png (tileset, na ordem de 'index' em content/tiles.json)
e apps/web/public/assets/city/objects/<sprite>.png (prédios e decoração de content/objects.json).
É arte de trabalho: para trocar, basta substituir os PNGs pelos definitivos com o mesmo tamanho.

Requer Python 3 e Pillow (pip install pillow). Uso: python3 tools/art/city_art.py
"""
import os
import random
from PIL import Image

T = 32
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'apps', 'web', 'public', 'assets', 'city')


def hx(s, a=255):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


# Paleta terrosa, próxima da dos personagens
P = {
    'ol': hx('#14100c'),  # contorno
    'g0': hx('#2f4419'), 'g1': hx('#3d5720'), 'g2': hx('#4e6a2a'), 'g3': hx('#64823a'), 'g4': hx('#7f9c4a'),
    'd0': hx('#4a2e19'), 'd1': hx('#5f3d22'), 'd2': hx('#7a5230'), 'd3': hx('#93683f'), 'd4': hx('#ad8352'),
    's0': hx('#2b2c31'), 's1': hx('#45474e'), 's2': hx('#5f626a'), 's3': hx('#7d8089'), 's4': hx('#a0a3aa'),
    'w0': hx('#1b2d4d'), 'w1': hx('#24406a'), 'w2': hx('#2f5788'), 'w3': hx('#4a78a8'), 'w4': hx('#8fb6d6'),
    'k0': hx('#2a160b'), 'k1': hx('#45250f'), 'k2': hx('#623719'), 'k3': hx('#7f4c25'), 'k4': hx('#9c6636'),
    'r0': hx('#3d1512'), 'r1': hx('#5e1f19'), 'r2': hx('#80301f'), 'r3': hx('#a2452a'), 'r4': hx('#c4643a'),
    'y': hx('#e0b23a'), 'y2': hx('#f3d27a'), 'f1': hx('#d9d3c2'), 'f2': hx('#c95c7a'), 'f3': hx('#e8c84a'),
    'glass': hx('#2d4a63'), 'glass2': hx('#6f9cbf'), 'fire': hx('#f08a2c'), 'fire2': hx('#ffd36a'),
    'sh': (0, 0, 0, 70),
    # telhados
    'gr0': hx('#16301e'), 'gr1': hx('#1f4529'), 'gr2': hx('#2b5e36'), 'gr3': hx('#3d7a45'), 'gr4': hx('#5a9a58'),
    'pu0': hx('#2a1636'), 'pu1': hx('#3d1f4f'), 'pu2': hx('#552d6b'), 'pu3': hx('#6f3f88'), 'pu4': hx('#9060a8'),
    'sl0': hx('#1d2533'), 'sl1': hx('#2a3547'), 'sl2': hx('#3a4860'), 'sl3': hx('#4f607b'), 'sl4': hx('#6f829c'),
    'bl0': hx('#14213d'), 'bl1': hx('#1d3159'), 'bl2': hx('#284379'), 'bl3': hx('#35589a'), 'bl4': hx('#5479b8'),
    'r': hx('#a2452a'),
    # gruta
    'c0': hx('#120f10'), 'c1': hx('#1f1a1a'), 'c2': hx('#2d2624'), 'c3': hx('#3d3430'), 'c4': hx('#52463f'),
    'cr0': hx('#16161c'), 'cr1': hx('#24242d'), 'cr2': hx('#34343f'), 'cr3': hx('#474755'), 'cr4': hx('#61606e'),
    'light': (255, 236, 170, 255),
}


class Img:
    def __init__(self, w, h):
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.w, self.h = w, h

    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            if c[3] < 255:
                base = self.im.getpixel((x, y))
                a = c[3] / 255
                c = tuple(round(c[i] * a + base[i] * (1 - a)) for i in range(3)) + (max(base[3], c[3]),)
            self.im.putpixel((x, y), c)

    def rect(self, x, y, w, h, c):
        for j in range(h):
            for i in range(w):
                self.px(x + i, y + j, c)

    def paste(self, other, x, y):
        self.im.alpha_composite(other.im, (x, y))


def speckle(img, ox, oy, w, h, base, dots, rng):
    img.rect(ox, oy, w, h, base)
    for color, n in dots:
        for _ in range(n):
            img.px(ox + rng.randrange(w), oy + rng.randrange(h), color)


# ---------------- tiles ----------------

def grass(seed, flowers=False):
    rng = random.Random(seed)
    t = Img(T, T)
    speckle(t, 0, 0, T, T, P['g2'], [(P['g1'], 38), (P['g3'], 26)], rng)
    # tufos: "V" de 3 px, claro em cima, escuro embaixo
    for _ in range(6):
        x, y = rng.randrange(1, T - 2), rng.randrange(2, T)
        t.px(x, y, P['g1']); t.px(x - 1, y - 1, P['g3']); t.px(x + 1, y - 1, P['g4'])
    if flowers:
        for _ in range(3):
            x, y = rng.randrange(2, T - 2), rng.randrange(2, T - 2)
            c = rng.choice([P['f1'], P['f2'], P['f3']])
            t.px(x, y, c); t.px(x - 1, y, c); t.px(x + 1, y, c); t.px(x, y - 1, c)
            t.px(x, y, P['y'] if c != P['f3'] else P['f1'])
            t.px(x, y + 1, P['g1'])
    return t


def dirt(seed):
    rng = random.Random(seed)
    t = Img(T, T)
    speckle(t, 0, 0, T, T, P['d2'], [(P['d1'], 110), (P['d3'], 80)], rng)
    for _ in range(5):  # pedrinhas
        x, y = rng.randrange(1, T - 2), rng.randrange(1, T - 2)
        t.px(x, y, P['d4']); t.px(x + 1, y, P['d3']); t.px(x, y + 1, P['d0']); t.px(x + 1, y + 1, P['d1'])
    return t


def cobble(seed):
    rng = random.Random(seed)
    t = Img(T, T)
    t.rect(0, 0, T, T, P['s0'])
    # pedras de 11x8 em fileiras desencontradas; cantos arredondados, luz em cima
    for row in range(4):
        off = 5 if row % 2 else 0
        for col in range(-1, 4):
            x0, y0 = col * 11 + off, row * 8
            w, h = 9, 6
            shade = rng.choice(['s2', 's2', 's3'])
            for j in range(h):
                for i in range(w):
                    if (i in (0, w - 1)) and (j in (0, h - 1)):
                        continue
                    c = P[shade]
                    if j == 0:
                        c = P['s3'] if shade == 's2' else P['s4']
                    elif j == h - 1:
                        c = P['s1'] if shade == 's2' else P['s2']
                    t.px((x0 + i) % T, y0 + j, c)
            if rng.random() < 0.3:
                t.px((x0 + rng.randrange(3, 7)) % T, y0 + 3, P['s1'])
    return t


def water(seed):
    rng = random.Random(seed)
    t = Img(T, T)
    speckle(t, 0, 0, T, T, P['w2'], [(P['w1'], 30)], rng)
    for y in (5, 14, 23, 30):
        x = rng.randrange(T)
        for i in range(rng.randrange(5, 9)):
            t.px((x + i) % T, y, P['w3'])
        t.px((x + 2) % T, y - 1, P['w4'])
    return t


def stone_wall():
    t = Img(T, T)
    t.rect(0, 0, T, T, P['s1'])
    for row in range(4):
        off = 8 if row % 2 else 0
        for col in range(-1, 3):
            x0, y0 = col * 16 + off, row * 8
            t.rect(x0 + 1, y0 + 1, 14, 6, P['s3'])
            t.rect(x0 + 1, y0 + 1, 14, 1, P['s4'])
            t.rect(x0 + 1, y0 + 6, 14, 1, P['s2'])
    return t


def wood_wall():
    t = Img(T, T)
    for i in range(4):
        x0 = i * 8
        t.rect(x0, 0, 8, T, P['k3'])
        t.rect(x0, 0, 1, T, P['k1'])
        t.rect(x0 + 1, 0, 1, T, P['k4'])
        t.rect(x0 + 6, 0, 1, T, P['k2'])
        for y in (5 + i * 7) % 28, (17 + i * 5) % 28:  # nós da madeira
            t.px(x0 + 3, y, P['k1']); t.px(x0 + 4, y + 1, P['k2'])
    return t


# ---------------- objetos ----------------

def tree():
    """Árvore de 2x2 tiles: copa redonda com contorno escuro, tronco e sombra."""
    rng = random.Random(7)
    t = Img(2 * T, 2 * T)
    cx, cy = 32, 26
    for y in range(52, 60):  # sombra
        for x in range(14, 50):
            if ((x - 32) / 18) ** 2 + ((y - 56) / 4) ** 2 <= 1:
                t.px(x, y, P['sh'])
    t.rect(28, 38, 8, 18, P['k2'])
    t.rect(28, 38, 2, 18, P['k1'])
    t.rect(33, 38, 2, 18, P['k3'])
    t.rect(26, 54, 3, 2, P['k2']); t.rect(35, 54, 3, 2, P['k2'])
    blobs = [(32, 22, 19), (20, 30, 11), (44, 30, 11), (26, 14, 10), (39, 14, 10), (32, 34, 12)]

    def inside(x, y, grow=0):
        return any((x - bx) ** 2 + (y - by) ** 2 <= (r + grow) ** 2 for bx, by, r in blobs)

    for y in range(t.h):
        for x in range(t.w):
            if inside(x, y, 1) and not inside(x, y):
                t.px(x, y, P['ol'])
            elif inside(x, y):
                # luz vindo de cima-esquerda
                d = (x - 22) + (y - 10)
                c = P['g4'] if d < 4 else P['g3'] if d < 20 else P['g2'] if d < 36 else P['g1']
                if rng.random() < 0.12:
                    c = P['g1'] if c in (P['g3'], P['g4']) else P['g3']
                t.px(x, y, c)
    for _ in range(10):  # folhas destacadas
        x, y = rng.randrange(14, 50), rng.randrange(8, 40)
        if inside(x, y) and inside(x + 1, y + 1):
            t.px(x, y, P['g4']); t.px(x + 1, y + 1, P['g1'])
    return t


def fence():
    t = Img(T, T)
    for x in (2, 26):
        t.rect(x, 10, 4, 20, P['k3']); t.rect(x, 10, 1, 20, P['k1']); t.rect(x + 3, 10, 1, 20, P['k2'])
        t.rect(x, 9, 4, 1, P['k4'])
    for y in (14, 22):
        t.rect(0, y, T, 3, P['k3']); t.rect(0, y, T, 1, P['k4']); t.rect(0, y + 2, T, 1, P['k1'])
    t.rect(0, 30, T, 2, P['sh'])
    return t


def anvil():
    t = Img(T, T)
    t.rect(7, 27, 18, 3, P['sh'])
    t.rect(11, 20, 10, 8, P['k2']); t.rect(11, 20, 10, 1, P['k3'])  # cepo
    t.rect(6, 13, 21, 4, P['s1']); t.rect(4, 13, 3, 2, P['s1'])  # bigorna
    t.rect(6, 13, 21, 1, P['s3'])
    t.rect(12, 17, 9, 3, P['s0'])
    return t


# ---------------- tiles com objeto pequeno ----------------

def bush_tile():
    """Arvorezinha de 1 tile (sólida), usada nos mapas ASCII com 'T'."""
    t = grass(101)
    rng = random.Random(9)
    for y in range(26, 30):
        for x in range(8, 25):
            if ((x - 16) / 8) ** 2 + ((y - 28) / 2) ** 2 <= 1:
                t.px(x, y, P['sh'])
    t.rect(14, 20, 4, 8, P['k2']); t.rect(14, 20, 1, 8, P['k1'])
    blobs = [(16, 12, 9), (10, 16, 6), (22, 16, 6)]

    def inside(x, y, g=0):
        return any((x - bx) ** 2 + (y - by) ** 2 <= (r + g) ** 2 for bx, by, r in blobs)

    for y in range(T):
        for x in range(T):
            if inside(x, y, 1) and not inside(x, y):
                t.px(x, y, P['ol'])
            elif inside(x, y):
                d = (x - 8) + (y - 4)
                c = P['g4'] if d < 4 else P['g3'] if d < 12 else P['g2'] if d < 22 else P['g1']
                if rng.random() < 0.1:
                    c = P['g1'] if c in (P['g3'], P['g4']) else P['g3']
                t.px(x, y, c)
    return t


def rock_tile():
    t = grass(102)
    for y in range(T):
        for x in range(T):
            if ((x - 16) / 12) ** 2 + ((y - 25) / 3) ** 2 <= 1:
                t.px(x, y, P['sh'])
    for y in range(T):
        for x in range(T):
            e = ((x - 16) / 12) ** 2 + ((y - 18) / 9) ** 2
            if e <= 1:
                d = (x - 10) + (y - 12)
                c = P['s4'] if d < 0 else P['s3'] if d < 10 else P['s2'] if d < 18 else P['s1']
                if e > 0.82:
                    c = P['ol']
                t.px(x, y, c)
    t.px(18, 17, P['s1']); t.px(19, 18, P['s1']); t.px(20, 18, P['s1'])
    return t


def fence_tile():
    t = grass(103)
    t.paste(fence(), 0, 0)
    return t


# ---------------- prédios ----------------

def roof_colors(prefix):
    if prefix == 'r':
        return [P['r0'], P['r1'], P['r2'], P['r3'], P['r4']]
    return [P[f'{prefix}{i}'] for i in range(5)]


def draw_icon(b, kind, x, y):
    """Ícone de 10x8 na placa."""
    if kind == 'hammer':
        b.rect(x + 2, y + 1, 6, 3, P['s3']); b.rect(x + 2, y + 1, 6, 1, P['s4'])
        b.rect(x + 4, y + 4, 2, 4, P['k1'])
    elif kind == 'coin':
        for j in range(8):
            for i in range(10):
                if ((i - 4.5) / 4) ** 2 + ((j - 3.5) / 3.6) ** 2 <= 1:
                    b.px(x + i, y + j, P['y'])
        b.rect(x + 4, y + 2, 2, 4, P['k3']); b.px(x + 3, y + 1, P['y2'])
    elif kind == 'mug':
        b.rect(x + 2, y + 2, 5, 6, P['k4']); b.rect(x + 2, y + 1, 5, 2, P['f1'])
        b.rect(x + 7, y + 3, 2, 1, P['k4']); b.rect(x + 8, y + 3, 1, 3, P['k4']); b.rect(x + 7, y + 5, 2, 1, P['k4'])
        b.rect(x + 3, y + 4, 1, 3, P['k2'])
    elif kind == 'potion':
        b.rect(x + 4, y, 2, 2, P['k4'])
        b.rect(x + 4, y + 2, 2, 1, P['glass2'])
        b.rect(x + 2, y + 3, 6, 5, P['pu3']); b.rect(x + 3, y + 3, 2, 2, P['pu4'])
        b.rect(x + 2, y + 6, 6, 2, P['pu2'])
    elif kind == 'swords':
        for i in range(8):
            b.px(x + 1 + i, y + i, P['s4']); b.px(x + 8 - i, y + i, P['s4'])
        b.rect(x + 1, y + 6, 2, 2, P['k3']); b.rect(x + 7, y + 6, 2, 2, P['k3'])
    elif kind == 'shield':
        for j in range(8):
            half = 4 if j < 4 else 4 - (j - 3)
            b.rect(x + 5 - half, y + j, half * 2, 1, P['bl3'])
        b.rect(x + 4, y + 1, 2, 5, P['y']); b.rect(x + 2, y + 2, 6, 2, P['y'])


def draw_sign(b, x, y, icon):
    b.rect(x, y, 14, 1, P['k1'])
    b.rect(x + 2, y + 1, 1, 3, P['s1']); b.rect(x + 11, y + 1, 1, 3, P['s1'])
    b.rect(x, y + 4, 14, 12, P['ol'])
    b.rect(x + 1, y + 5, 12, 10, P['k3'])
    b.rect(x + 1, y + 5, 12, 1, P['k4'])
    draw_icon(b, icon, x + 2, y + 6)


def draw_window(b, x, y, lit=False):
    b.rect(x - 1, y - 1, 18, 16, P['k1'])
    if lit:
        b.rect(x, y, 16, 14, P['fire'])
        b.rect(x, y + 7, 16, 7, P['y'])
        b.rect(x + 2, y + 2, 3, 3, P['fire2'])
    else:
        b.rect(x, y, 16, 14, P['glass'])
        b.rect(x + 2, y + 2, 3, 4, P['glass2'])
    b.rect(x + 7, y, 2, 14, P['k2']); b.rect(x, y + 6, 16, 2, P['k2'])
    b.rect(x - 2, y + 14, 20, 2, P['k3'])


def draw_door(b, kind, dx, top, bottom, dw):
    for y in range(top, bottom):
        for x in range(dx, dx + dw):
            ry = y - top
            r_arch = dw / 2
            if ry < 6 and ((x - dx - r_arch + 0.5) / r_arch) ** 2 + ((ry - 6) / 6) ** 2 > 1:
                continue
            if kind == 'forge':
                ex, ey = (x - (dx + dw / 2)) / 13, (y - (bottom - 6)) / 12
                r = ex * ex + ey * ey
                c = P['fire2'] if r < 0.25 else P['fire'] if r < 0.6 else P['r2'] if r < 1.1 else P['r0'] if r < 1.8 else P['ol']
                if c in (P['fire'], P['r2']) and (x + y) % 2 and 0.5 < r < 1.3:
                    c = P['r2'] if c == P['fire'] else P['r0']
            else:
                lx = (x - dx) % 6
                c = P['k1'] if lx == 0 else P['k2'] if lx < 3 else P['k3']
                if kind == 'double' and x - dx == dw // 2:
                    c = P['ol']
            b.px(x, y, c)
    b.rect(dx - 2, top + 4, 2, bottom - top - 4, P['k1'])
    b.rect(dx + dw, top + 4, 2, bottom - top - 4, P['k1'])
    if kind in ('arch', 'double'):
        hx_ = dx + dw - 5 if kind == 'arch' else dx + dw // 2 + 2
        b.rect(hx_, top + 14, 2, 2, P['y'])
        if kind == 'double':
            b.rect(dx + dw // 2 - 4, top + 14, 2, 2, P['y'])
    if kind == 'boarded':
        for i in range(dw + 4):
            for k in range(3):
                b.px(dx - 2 + i, top + 8 + i * 12 // dw + k, P['k4'] if k == 0 else P['k3'])
                b.px(dx - 2 + i, bottom - 6 - i * 12 // dw + k, P['k4'] if k == 0 else P['k3'])


def building(w_tiles, roof, wall, door, icon, chimney=False, lit=False, awning=None, banners=False):
    W, H = w_tiles * T, 4 * T
    b = Img(W, H)
    wall_top, wall_bottom = 58, H - 4
    b.rect(6, H - 4, W - 6, 4, P['sh'])
    sw, ww = stone_wall(), wood_wall()
    for x in range(4, W - 4, T):
        for y in range(wall_top, wall_bottom, T):
            if wall == 'stone':
                src = sw
            elif wall == 'wood':
                src = ww
            else:
                src = sw if y >= wall_top + 32 else ww
            crop = src.im.crop((0, 0, min(T, W - 4 - x), min(T, wall_bottom - y)))
            b.im.alpha_composite(crop, (x, y))
    if wall == 'mixed':
        b.rect(4, wall_top + 32, W - 8, 2, P['k1'])
    b.rect(4, wall_top, W - 8, 2, P['k1'] if wall != 'stone' else P['s0'])
    b.rect(3, wall_top, 1, wall_bottom - wall_top, P['ol']); b.rect(W - 4, wall_top, 1, wall_bottom - wall_top, P['ol'])
    b.rect(3, wall_bottom, W - 6, 1, P['ol'])
    # telhado em telhas com beiral
    rc = roof_colors(roof)
    roof_top, roof_bottom = 14, wall_top + 4
    for y in range(roof_top, roof_bottom):
        inset = max(0, (roof_top + 10 - y)) // 2
        for x in range(inset, W - inset):
            row = (y - roof_top) // 5
            lx = (x + (row % 2) * 4) % 8
            ly = (y - roof_top) % 5
            c = rc[3]
            if ly == 4:
                c = rc[1]
            elif lx == 0:
                c = rc[2]
            elif ly == 0 and lx in (3, 4):
                c = rc[4]
            if (y - roof_top) / (roof_bottom - roof_top) > 0.75 and c == rc[3]:
                c = rc[2]
            b.px(x, y, c)
        b.px(inset - 1, y, P['ol']); b.px(W - inset, y, P['ol'])
    b.rect(0, roof_top - 1, W, 1, P['ol'])
    b.rect(2, roof_top, W - 4, 1, rc[4])
    b.rect(0, roof_bottom, W, 1, P['ol'])
    b.rect(0, roof_bottom + 1, W, 2, P['sh'])
    if chimney:
        cx = W - 40
        b.rect(cx, 0, 14, roof_top + 8, P['s2'])
        for yy in range(0, roof_top + 8, 4):
            b.rect(cx + (2 if yy % 8 else 0), yy, 6, 1, P['s1'])
        b.rect(cx, 0, 1, roof_top + 8, P['ol']); b.rect(cx + 13, 0, 1, roof_top + 8, P['ol'])
        b.rect(cx - 1, 0, 16, 2, P['s3'])
    dw = {'forge': 36, 'double': 28}.get(door, 22)
    dx = W // 2 - dw // 2
    door_top = wall_top + (22 if door == 'forge' else 26)
    # janelas: uma de cada lado da porta, e mais nas pontas se o prédio for largo
    spots = [20, W - 36]
    if w_tiles >= 6:
        spots += [52, W - 68]
    for wx in spots:
        if wx + 18 < dx - 2 or wx > dx + dw + 2:
            draw_window(b, wx, wall_top + 8, lit)
    if awning:
        a1, a2 = P[awning[0]], P[awning[1]]
        y0 = wall_top + 2
        for x in range(4, W - 4):
            c = a1 if (x // 6) % 2 == 0 else a2
            for y in range(y0, y0 + 7):
                b.px(x, y, c)
            if (x % 6) in (1, 2, 3, 4):
                b.px(x, y0 + 7, c)
        b.rect(4, y0, W - 8, 1, P['ol'])
    if banners:
        for bx in (8, W - 18):
            b.rect(bx, wall_top + 4, 10, 1, P['k1'])
            b.rect(bx + 1, wall_top + 5, 8, 22, P['bl2'])
            b.rect(bx + 1, wall_top + 5, 1, 22, P['bl3'])
            b.rect(bx + 3, wall_top + 11, 4, 4, P['y'])
            for i in range(4):
                b.px(bx + 1 + i, wall_top + 27 + i // 2, P['bl2']); b.px(bx + 8 - i, wall_top + 27 + i // 2, P['bl2'])
    draw_door(b, door, dx, door_top, wall_bottom, dw)
    # placa centralizada acima da porta
    draw_sign(b, W // 2 - 7, wall_top + (9 if awning else 3) - (2 if door == 'forge' else 0), icon)
    return b


# ---------------- decoração ----------------

def fountain():
    """Chafariz de 2x2 tiles para a praça."""
    f = Img(2 * T, 2 * T)
    cx, cy = 32, 40
    for y in range(f.h):
        for x in range(f.w):
            e = ((x - cx) / 28) ** 2 + ((y - cy) / 16) ** 2
            if e <= 1:
                c = P['s3'] if y < cy - 4 else P['s2']
                if e > 0.86:
                    c = P['ol']
                elif e > 0.62:
                    c = P['s4'] if y < cy else P['s2']
                else:
                    c = P['w2'] if (x + y) % 7 else P['w3']
                f.px(x, y, c)
    f.rect(29, 14, 6, 26, P['s2']); f.rect(29, 14, 1, 26, P['ol']); f.rect(34, 14, 1, 26, P['ol']); f.rect(30, 14, 2, 26, P['s3'])
    f.rect(24, 12, 16, 4, P['s3']); f.rect(24, 12, 16, 1, P['s4']); f.rect(24, 15, 16, 1, P['ol'])
    for i, (x, y) in enumerate([(31, 6), (32, 8), (30, 10), (33, 10), (26, 18), (38, 18), (24, 24), (40, 24)]):
        f.px(x, y, P['w4'] if i % 2 else P['w3'])
    return f


def barrel():
    t = Img(T, T)
    t.rect(8, 28, 16, 3, P['sh'])
    for y in range(8, 29):
        bulge = 1 if 12 < y < 25 else 0
        t.rect(9 - bulge, y, 14 + 2 * bulge, 1, P['k3'])
        t.px(9 - bulge, y, P['ol']); t.px(22 + bulge, y, P['ol'])
        t.rect(11, y, 2, 1, P['k4'])
    for y in (11, 25):
        t.rect(8, y, 16, 2, P['s1'])
    t.rect(9, 7, 14, 2, P['k2']); t.rect(9, 7, 14, 1, P['ol'])
    return t


# ---------------- gruta ----------------

def cave_floor(seed):
    rng = random.Random(seed)
    t = Img(T, T)
    speckle(t, 0, 0, T, T, P['c2'], [(P['c1'], 70), (P['c3'], 50)], rng)
    for _ in range(4):  # pedregulhos
        x, y = rng.randrange(1, T - 2), rng.randrange(1, T - 2)
        t.px(x, y, P['c4']); t.px(x + 1, y, P['c3']); t.px(x, y + 1, P['c0']); t.px(x + 1, y + 1, P['c1'])
    if rng.random() < 0.5:  # rachadura
        x, y = rng.randrange(4, 26), rng.randrange(4, 26)
        for i in range(rng.randrange(4, 8)):
            t.px(x + i, y + (i // 2) * (1 if seed % 2 else -1), P['c0'])
    return t


def cave_wall(seed):
    """Rocha maciça vista de cima: blocos irregulares com luz no topo esquerdo."""
    rng = random.Random(seed)
    t = Img(T, T)
    t.rect(0, 0, T, T, P['cr0'])
    for _ in range(7):
        cx, cy = rng.randrange(0, T), rng.randrange(0, T)
        rx, ry = rng.randrange(6, 12), rng.randrange(5, 9)
        for y in range(cy - ry, cy + ry + 1):
            for x in range(cx - rx, cx + rx + 1):
                e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
                if e <= 1:
                    d = (x - cx) + (y - cy)
                    c = P['cr3'] if d < -rx // 2 else P['cr2'] if d < rx // 2 else P['cr1']
                    if e > 0.8:
                        c = P['cr0']
                    t.px(x % T, y % T, c)
    for _ in range(10):
        t.px(rng.randrange(T), rng.randrange(T), P['cr4'])
    return t


def cave_rock():
    t = cave_floor(301)
    for y in range(T):
        for x in range(T):
            if ((x - 16) / 12) ** 2 + ((y - 25) / 3) ** 2 <= 1:
                t.px(x, y, P['sh'])
    for y in range(T):
        for x in range(T):
            e = ((x - 16) / 11) ** 2 + ((y - 17) / 9) ** 2
            if e <= 1:
                d = (x - 10) + (y - 11)
                c = P['cr4'] if d < 0 else P['cr3'] if d < 10 else P['cr2'] if d < 18 else P['cr1']
                t.px(x, y, P['ol'] if e > 0.82 else c)
    return t


def cave_light(from_top):
    """Chão com luz do dia entrando pela abertura (entrada em cima, saída embaixo)."""
    t = cave_floor(302 if from_top else 303)
    for y in range(T):
        k = (T - y) / T if from_top else y / T
        a = int(110 * k * k)
        for x in range(T):
            if a > 0:
                t.px(x, y, P['light'][:3] + (a,))
    return t


# ---------------- floresta ----------------

def forest_floor(seed):
    """Chão da floresta: grama mais escura, folhas caídas e manchas de terra."""
    rng = random.Random(seed)
    t = Img(T, T)
    speckle(t, 0, 0, T, T, P['g1'], [(P['g0'], 60), (P['g2'], 40)], rng)
    for _ in range(3):
        cx, cy = rng.randrange(T), rng.randrange(T)
        for _ in range(10):
            t.px((cx + rng.randrange(-3, 4)) % T, (cy + rng.randrange(-2, 3)) % T, P['d1'])
    for _ in range(7):  # folhas caídas
        x, y = rng.randrange(1, T - 1), rng.randrange(1, T - 1)
        c = rng.choice([P['k3'], P['k4'], P['y'], P['g3']])
        t.px(x, y, c); t.px(x + 1, y, c)
    return t


def forest_wall(seed):
    """Mata fechada vista de cima: copas sobrepostas, escuras nas bordas, com luz no topo esquerdo."""
    rng = random.Random(seed)
    t = Img(T, T)
    t.rect(0, 0, T, T, P['g0'])
    for _ in range(9):
        cx, cy, r = rng.randrange(-4, T + 4), rng.randrange(-4, T + 4), rng.randrange(7, 12)
        for y in range(cy - r, cy + r + 1):
            for x in range(cx - r, cx + r + 1):
                e = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r)
                if e <= 1 and 0 <= x < T and 0 <= y < T:
                    d = (x - cx) + (y - cy)
                    c = P['g3'] if d < -r // 2 else P['g2'] if d < r // 3 else P['g1']
                    if e > 0.85:
                        c = P['g0']
                    t.px(x, y, c)
    for _ in range(14):
        x, y = rng.randrange(T - 1), rng.randrange(T - 1)
        t.px(x, y, P['g4']); t.px(x + 1, y + 1, P['g0'])
    return t


def forest_bush():
    """Arbusto de frutinhas sobre o chão da floresta (sólido)."""
    t = forest_floor(401)
    for y in range(T):
        for x in range(T):
            if ((x - 16) / 11) ** 2 + ((y - 26) / 3) ** 2 <= 1:
                t.px(x, y, P['sh'])
    rng = random.Random(402)
    blobs = [(16, 15, 9), (9, 19, 6), (23, 19, 6)]

    def inside(x, y, g=0):
        return any((x - bx) ** 2 + (y - by) ** 2 <= (r + g) ** 2 for bx, by, r in blobs)

    for y in range(T):
        for x in range(T):
            if inside(x, y, 1) and not inside(x, y):
                t.px(x, y, P['ol'])
            elif inside(x, y):
                d = (x - 8) + (y - 8)
                t.px(x, y, P['gr3'] if d < 8 else P['gr2'] if d < 20 else P['gr1'])
    for _ in range(9):
        x, y = rng.randrange(6, 26), rng.randrange(8, 24)
        if inside(x, y):
            t.px(x, y, P['f2']); t.px(x + 1, y, P['r2'])
    return t


def forest_light(from_top):
    """Trilha clara onde a mata se abre (entrada em cima, saída embaixo)."""
    t = forest_floor(403 if from_top else 404)
    rng = random.Random(405)
    for _ in range(80):
        t.px(rng.randrange(T), rng.randrange(T), P['d2'])
    for y in range(T):
        k = (T - y) / T if from_top else y / T
        a = int(90 * k * k)
        for x in range(T):
            if a > 0:
                t.px(x, y, P['light'][:3] + (a,))
    return t


# ---------------- covil do dragão ----------------

LAVA = [hx('#5a1206'), hx('#a8280a'), hx('#e0560f'), hx('#f59a1e'), hx('#ffd36a')]


def lair_floor(seed):
    """Basalto escuro com rachaduras que brilham (calor da lava por baixo)."""
    rng = random.Random(seed)
    t = Img(T, T)
    speckle(t, 0, 0, T, T, hx('#2a1f1f'), [(hx('#1c1414'), 60), (hx('#3a2b28'), 50)], rng)
    for _ in range(2):
        x, y = rng.randrange(3, 26), rng.randrange(3, 26)
        for i in range(rng.randrange(5, 10)):
            xx, yy = x + i, y + (i // 2) * (1 if rng.random() < 0.5 else -1)
            t.px(xx, yy, LAVA[1])
            if i % 3 == 1:
                t.px(xx, yy - 1, LAVA[2])
    for _ in range(4):
        t.px(rng.randrange(T), rng.randrange(T), hx('#4a3a34'))
    return t


def lair_wall(seed):
    """Rocha vulcânica: blocos escuros com bordas avermelhadas."""
    rng = random.Random(seed)
    t = Img(T, T)
    t.rect(0, 0, T, T, hx('#140c0c'))
    for _ in range(7):
        cx, cy = rng.randrange(0, T), rng.randrange(0, T)
        rx, ry = rng.randrange(6, 12), rng.randrange(5, 9)
        for y in range(cy - ry, cy + ry + 1):
            for x in range(cx - rx, cx + rx + 1):
                e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
                if e <= 1:
                    d = (x - cx) + (y - cy)
                    c = hx('#4a3430') if d < -rx // 2 else hx('#352523') if d < rx // 2 else hx('#251917')
                    if e > 0.8:
                        c = hx('#140c0c')
                    t.px(x % T, y % T, c)
    for _ in range(6):
        t.px(rng.randrange(T), rng.randrange(T), LAVA[0])
    return t


def lair_lava():
    """Poça de lava (sólida): borda de rocha, miolo brilhante."""
    t = lair_floor(501)
    rng = random.Random(502)
    for y in range(T):
        for x in range(T):
            e = ((x - 16) / 13) ** 2 + ((y - 17) / 10) ** 2
            if e <= 1:
                c = LAVA[3] if e < 0.25 else LAVA[2] if e < 0.6 else LAVA[1] if e < 0.85 else hx('#140c0c')
                t.px(x, y, c)
    for _ in range(10):
        x, y = rng.randrange(8, 24), rng.randrange(10, 24)
        if ((x - 16) / 13) ** 2 + ((y - 17) / 10) ** 2 < 0.5:
            t.px(x, y, LAVA[4])
    return t


def lair_light(from_top):
    """Passagem do covil: chão com luz fria entrando (entrada em cima, saída embaixo)."""
    t = lair_floor(503 if from_top else 504)
    for y in range(T):
        k = (T - y) / T if from_top else y / T
        a = int(100 * k * k)
        for x in range(T):
            if a > 0:
                t.px(x, y, P['light'][:3] + (a,))
    return t


BUILDINGS = {
    'market': dict(w_tiles=6, roof='gr', wall='wood', door='double', icon='coin', awning=('r3', 'f1')),
    'tavern': dict(w_tiles=6, roof='r', wall='mixed', door='double', icon='mug', chimney=True, lit=True),
    'blacksmith': dict(w_tiles=5, roof='r', wall='mixed', door='forge', icon='hammer', chimney=True),
    'alchemist': dict(w_tiles=4, roof='pu', wall='wood', door='arch', icon='potion'),
    'training-hall': dict(w_tiles=6, roof='sl', wall='stone', door='boarded', icon='swords'),
    'guild': dict(w_tiles=5, roof='bl', wall='stone', door='boarded', icon='shield', banners=True),
}

# Ordem = campo 'index' de content/tiles.json
TERRAIN = [
    ('grass', lambda: grass(1)),
    ('path', lambda: dirt(4)),
    ('wall', stone_wall),
    ('tree', bush_tile),
    ('rock', rock_tile),
    ('water', lambda: water(6)),
    ('cobble', lambda: cobble(5)),
    ('flowers', lambda: grass(3, flowers=True)),
    ('fence', fence_tile),
    ('grass-b', lambda: grass(2)),
    ('grass-c', lambda: grass(7)),
    ('path-b', lambda: dirt(8)),
    ('cobble-b', lambda: cobble(9)),
    ('water-b', lambda: water(10)),
    ('cave-floor', lambda: cave_floor(11)),
    ('cave-wall', lambda: cave_wall(12)),
    ('cave-rock', cave_rock),
    ('cave-mouth', lambda: cave_light(True)),
    ('cave-down', lambda: cave_light(False)),
    ('cave-floor-b', lambda: cave_floor(13)),
    ('cave-wall-b', lambda: cave_wall(14)),
    ('forest-floor', lambda: forest_floor(15)),
    ('forest-wall', lambda: forest_wall(16)),
    ('forest-bush', forest_bush),
    ('forest-in', lambda: forest_light(True)),
    ('forest-out', lambda: forest_light(False)),
    ('forest-floor-b', lambda: forest_floor(17)),
    ('forest-wall-b', lambda: forest_wall(18)),
    ('lair-floor', lambda: lair_floor(19)),
    ('lair-wall', lambda: lair_wall(20)),
    ('lair-lava', lair_lava),
    ('lair-in', lambda: lair_light(True)),
    ('lair-out', lambda: lair_light(False)),
    ('lair-floor-b', lambda: lair_floor(21)),
]


def main():
    os.makedirs(os.path.join(OUT, 'objects'), exist_ok=True)
    sheet = Img(len(TERRAIN) * T, T)
    for i, (_, make) in enumerate(TERRAIN):
        sheet.paste(make(), i * T, 0)
    sheet.im.save(os.path.join(OUT, 'terrain.png'))
    objects = {name: building(**spec) for name, spec in BUILDINGS.items()}
    objects.update({'tree': tree(), 'anvil': anvil(), 'fountain': fountain(), 'barrel': barrel()})
    for name, img in objects.items():
        img.im.save(os.path.join(OUT, 'objects', f'{name}.png'))
    print(f'Arte gerada em {OUT}: terrain.png ({len(TERRAIN)} tiles) e {len(objects)} objetos')


if __name__ == '__main__':
    main()
