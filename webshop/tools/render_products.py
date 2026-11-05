"""Erzeugt Produktbilder (3D-Renderings) für alle Artikel aus data/products.json.

Aufruf (im Ordner webshop):  python3 tools/render_products.py
Ergebnis: public/img/products/<id>.jpg  (800 x 800 px)

Die Bilder sind Illustrationen, keine Fotos. Sobald echte Produktfotos
vorliegen, einfach die JPG-Dateien gleichen Namens ersetzen.
"""
import json
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'img', 'products')
SS = 2                 # Supersampling
SIZE = 800 * SS
BG = (255, 255, 255)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

STEEL = (168, 172, 178)
DARK_STEEL = (110, 114, 120)
ANTHRACITE = (66, 69, 74)
ORANGE = (240, 120, 0)
SEGMENT = (58, 58, 60)
CARBIDE = (150, 152, 158)
ZINC = (186, 192, 198)

L = (-0.55, 0.0, 0.83)            # Lichtrichtung (von links vorne)
H = (L[0] / 2, 0, (L[2] + 1) / 2)  # Halbvektor für Glanzlicht
hn = math.sqrt(H[0] ** 2 + H[2] ** 2)
H = (H[0] / hn, 0, H[2] / hn)


def shade(color, u, gloss=0.6, rough=30):
    """Farbe einer Zylinderspalte mit Normalen-x-Anteil u (-1 … 1)."""
    s = math.sqrt(max(0.0, 1 - u * u))
    diff = max(0.0, u * L[0] + s * L[2])
    spec = max(0.0, u * H[0] + s * H[2]) ** rough * gloss
    f = 0.32 + 0.78 * diff
    return tuple(int(max(0, min(255, c * f + 255 * spec))) for c in color)


def cylinder(d, cx, ytop, ybot, R, e, color, gloss=0.6, rough=30, top=True, top_color=None):
    """Senkrechter Zylinder in leichter Aufsicht (Ellipsen-Halbhöhe e)."""
    for x in range(int(cx - R), int(cx + R) + 1):
        u = (x - cx) / R
        if abs(u) > 1:
            continue
        s = math.sqrt(1 - u * u)
        d.line([(x, ytop + e * s), (x, ybot + e * s)], fill=shade(color, u, gloss, rough))
    if top:
        tc = top_color or tuple(min(255, int(c * 1.12)) for c in color)
        d.ellipse([cx - R, ytop - e, cx + R, ytop + e], fill=tc)
        d.ellipse([cx - R, ytop - e, cx + R, ytop + e], outline=tuple(min(255, c + 40) for c in tc), width=2 * SS)


def thread(d, cx, ytop, ybot, R, e, color, pitch=7):
    cylinder(d, cx, ytop, ybot, R, e, color, gloss=0.5)
    y = ytop + pitch * SS
    while y < ybot:
        d.arc([cx - R, y - e, cx + R, y + e], 15, 165, fill=tuple(int(c * 0.45) for c in color), width=max(2, SS + 1))
        y += pitch * SS


def segments(d, cx, ybot, R, e, h, n, color, gap=0.22, sparkle=True, rnd=None):
    """Diamantsegmente / Hartmetallzähne am unteren Rand."""
    rnd = rnd or random.Random(1)
    Rs = R * 1.035
    for x in range(int(cx - Rs), int(cx + Rs) + 1):
        u = (x - cx) / Rs
        if abs(u) > 1:
            continue
        th = math.acos(u)                      # 0 … pi, vordere Hälfte
        frac = (th / (2 * math.pi) * n + 0.5) % 1.0
        s = math.sqrt(1 - u * u)
        if frac < gap:   # Lücke: man sieht ins dunkle Innere der Krone
            d.line([(x, ybot + e * s - 2 * SS), (x, ybot + e * s + h * 0.85)], fill=(34, 34, 36))
            continue
        col = shade(color, u, gloss=0.25, rough=12)
        y0, y1 = ybot + e * s - 2 * SS, ybot + e * s + h
        d.line([(x, y0), (x, y1)], fill=col)
        if sparkle:
            for _ in range(int(h / (5 * SS))):
                if rnd.random() < 0.55:
                    yy = rnd.uniform(y0, y1)
                    v = rnd.randint(150, 235)
                    d.point((x, yy), fill=(v, v, v))


def shadow(img, cx, y, R, e):
    sh = Image.new('L', img.size, 0)
    ImageDraw.Draw(sh).ellipse([cx - R * 1.25, y - e * 0.9, cx + R * 1.25, y + e * 1.3], fill=110)
    sh = sh.filter(ImageFilter.GaussianBlur(18 * SS))
    img.paste((150, 150, 150), (0, 0), sh)


def engrave(d, cx, y, text, size, color):
    f = ImageFont.truetype(FONT, size * SS)
    d.text((cx, y), text, font=f, fill=color, anchor='mm')


def base():
    img = Image.new('RGB', (SIZE, SIZE), BG)
    return img, ImageDraw.Draw(img)


def core_bit(p, body, length_px, conn):
    dia = p['specs']['durchmesser']
    R = (55 + (min(dia, 202) - 52) * 1.0) * SS
    e = R * 0.30
    cx = SIZE / 2
    seg_h = 34 * SS
    stud_h = (70 if conn == 'unc' else 52) * SS
    total = length_px * SS + seg_h + stud_h + 40 * SS + 2 * e
    ytop = (SIZE - total) / 2 + stud_h + 40 * SS + e
    ybot = ytop + length_px * SS
    img, d = base()
    shadow(img, cx, ybot + seg_h + e * 0.4, R, e)
    d = ImageDraw.Draw(img)
    segments(d, cx, ybot, R, e, seg_h, p['specs'].get('segmente', 8), SEGMENT, rnd=random.Random(dia))
    cylinder(d, cx, ytop, ybot, R, e, body, gloss=0.35 if body != STEEL else 0.6,
             rough=18, top_color=tuple(int(c * 0.8) for c in STEEL))
    # Deckel mit Anschluss
    if conn == 'unc':
        cylinder(d, cx, ytop - 18 * SS, ytop, 52 * SS, 52 * SS * 0.3, DARK_STEEL)          # Sechskant-Bund
        thread(d, cx, ytop - 18 * SS - stud_h, ytop - 18 * SS, 30 * SS, 30 * SS * 0.3, STEEL)
        d.ellipse([cx - 30 * SS, ytop - 18 * SS - stud_h - 9 * SS, cx + 30 * SS, ytop - 18 * SS - stud_h + 9 * SS], fill=(205, 208, 212))
        d.ellipse([cx - 12 * SS, ytop - 18 * SS - stud_h - 4 * SS, cx + 12 * SS, ytop - 18 * SS - stud_h + 4 * SS], fill=(70, 70, 72))
    else:
        cylinder(d, cx, ytop - 14 * SS, ytop, 36 * SS, 36 * SS * 0.3, DARK_STEEL)
        thread(d, cx, ytop - 14 * SS - stud_h, ytop - 14 * SS, 17 * SS, 17 * SS * 0.3, STEEL, pitch=6)
    txt_col = (235, 235, 235) if body != STEEL else (70, 70, 72)
    engrave(d, cx, ytop + e + 46 * SS, f'Ø {dia}', 30 if R > 80 * SS else 22, txt_col)
    return img


def hole_saw(p):
    dia = p['specs']['durchmesser']
    R = (dia * 1.35) * SS
    e = R * 0.32
    cx = SIZE / 2
    body_h = 95 * SS
    shank_h = 250 * SS
    ytop = 330 * SS
    ybot = ytop + body_h
    img, d = base()
    shadow(img, cx, ybot + 120 * SS, R * 0.8, e)
    d = ImageDraw.Draw(img)
    # Zentrierbohrer unten
    drill_y1 = ybot + 150 * SS
    cylinder(d, cx, ybot, drill_y1, 8 * SS, 3 * SS, STEEL, top=False)
    d.polygon([(cx - 8 * SS, drill_y1), (cx + 8 * SS, drill_y1), (cx, drill_y1 + 22 * SS)], fill=CARBIDE)
    segments(d, cx, ybot, R, e, 22 * SS, 10, CARBIDE, gap=0.35, sparkle=False)
    cylinder(d, cx, ytop, ybot, R, e, ANTHRACITE, gloss=0.3, rough=14, top_color=(90, 93, 98))
    engrave(d, cx, ytop + e + 30 * SS, f'Ø {dia}', 22, (225, 225, 225))
    # SDS-plus-Schaft
    cylinder(d, cx, ytop - 16 * SS, ytop, 30 * SS, 9 * SS, DARK_STEEL)
    sy0 = ytop - 16 * SS - shank_h
    cylinder(d, cx, sy0, ytop - 16 * SS, 13 * SS, 4 * SS, STEEL)
    for gy in (sy0 + 25 * SS, sy0 + 80 * SS):
        d.rectangle([cx - 4 * SS, gy, cx + 4 * SS, gy + 38 * SS], fill=(95, 98, 104))
    return img


def adapter(p):
    img, d = base()
    cx = SIZE / 2
    shadow(img, cx, 640 * SS, 70 * SS, 22 * SS)
    d = ImageDraw.Draw(img)
    thread(d, cx, 470 * SS, 600 * SS, 18 * SS, 6 * SS, STEEL, pitch=6)          # M16 unten
    cylinder(d, cx, 300 * SS, 470 * SS, 62 * SS, 19 * SS, DARK_STEEL, top=False)
    thread(d, cx, 180 * SS, 300 * SS, 34 * SS, 10 * SS, STEEL)                    # 1¼" UNC oben
    d.ellipse([cx - 34 * SS, 170 * SS, cx + 34 * SS, 190 * SS], fill=(205, 208, 212))
    return img


def extension(p):
    img, d = base()
    cx = SIZE / 2
    shadow(img, cx, 720 * SS, 48 * SS, 15 * SS)
    d = ImageDraw.Draw(img)
    cylinder(d, cx, 170 * SS, 700 * SS, 48 * SS, 14 * SS, ZINC, gloss=0.7, rough=40, top=False)
    cylinder(d, cx, 140 * SS, 170 * SS, 52 * SS, 15 * SS, DARK_STEEL)
    thread(d, cx, 70 * SS, 140 * SS, 30 * SS, 9 * SS, STEEL)
    d.ellipse([cx - 30 * SS, 61 * SS, cx + 30 * SS, 79 * SS], fill=(205, 208, 212))
    engrave(d, cx, 430 * SS, '500', 22, (80, 84, 90))
    return img


def centering_drill(p):
    img, d = base()
    cx = SIZE / 2
    shadow(img, cx, 720 * SS, 26 * SS, 8 * SS)
    d = ImageDraw.Draw(img)
    y0, y1, y2 = 90 * SS, 380 * SS, 690 * SS
    cylinder(d, cx, y0, y1, 16 * SS, 5 * SS, STEEL)
    for gy in (y0 + 30 * SS, y0 + 110 * SS):
        d.rectangle([cx - 5 * SS, gy, cx + 5 * SS, gy + 50 * SS], fill=(95, 98, 104))
    cylinder(d, cx, y1, y2, 14 * SS, 4 * SS, DARK_STEEL, top=False)
    y = y1 + 10 * SS                       # Spiralnuten
    while y < y2 - 30 * SS:
        d.line([(cx - 14 * SS, y + 26 * SS), (cx + 14 * SS, y)], fill=(55, 57, 60), width=5 * SS)
        y += 34 * SS
    d.polygon([(cx - 16 * SS, y2), (cx + 16 * SS, y2), (cx, y2 + 28 * SS)], fill=CARBIDE)
    return img


def render(p):
    cat = p['category']
    if cat == 'Nassbohrkronen':
        return core_bit(p, ANTHRACITE, 330, 'unc')
    if cat == 'Trockenbohrkronen':
        return core_bit(p, ORANGE, 150 if p['specs'].get('nutzlaenge', 150) <= 150 else 230, 'm16')
    if cat == 'Dosensenker':
        return hole_saw(p)
    if 'adapter' in p['id']:
        return adapter(p)
    if 'verl' in p['id']:
        return extension(p)
    return centering_drill(p)


def fit(img, fill=0.95):
    """Motiv mittig und formatfüllend auf quadratische Fläche setzen."""
    diff = Image.eval(img.convert('L'), lambda v: 255 if v < 250 else 0)
    x0, y0, x1, y1 = diff.getbbox()
    m = 70 * SS   # Rand, damit der weiche Schatten nicht abgeschnitten wird
    x0, y0 = max(0, x0 - m), max(0, y0 - m)
    x1, y1 = min(img.width, x1 + m), min(img.height, y1 + m)
    side = int(max(x1 - x0, y1 - y0) / fill)
    out = Image.new('RGB', (side, side), BG)
    out.paste(img.crop((x0, y0, x1, y1)), ((side - (x1 - x0)) // 2, (side - (y1 - y0)) // 2))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(ROOT, 'data', 'products.json'), encoding='utf-8') as f:
        products = json.load(f)
    for p in products:
        img = fit(render(p)).resize((800, 800), Image.LANCZOS)
        path = os.path.join(OUT, p['id'] + '.jpg')
        img.save(path, quality=84, optimize=True, progressive=True)
        print(path, os.path.getsize(path) // 1024, 'KB')


if __name__ == '__main__':
    main()
