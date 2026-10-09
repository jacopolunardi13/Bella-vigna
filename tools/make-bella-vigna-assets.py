#!/usr/bin/env python3
"""
Build Bella Vigna's brand assets from the one logo the property supplied.

    python3 -I tools/make-bella-vigna-assets.py

Source: assets/img/_src/brand/Bella_Vigna_logo_oro_classico.jpg — the classic
gold logo (Duomo skyline, "Bella Vigna" script, B&B, vines) exactly as Valentina
Longo sent it by email on 11 March 2026: 1024 x 1024, gold on a cream ground.
The guide needs it on transparency, so the ground is taken out and nothing else:
each pixel becomes the gold that, laid back over that same cream, gives exactly
the original pixel (see `from_original`). Nothing here redraws the mark: every
output is a crop, a resize or a composition of those same pixels.

Outputs (committed; the guide never builds anything at runtime):

  assets/img/brand/bella-vigna-mark.webp        the script wordmark, for the header and the Pass
  assets/img/brand/bella-vigna-logo.webp        the whole logo, for the welcome block
  assets/img/pass/bella-vigna-pass-{700,1024}.webp
                                                the Pass artwork: the logo's skyline and
                                                vines in gold on warm paper, the middle
                                                left quiet for the guest's name
  assets/icon-{180,192,512}.png, assets/icon.svg
                                                the app icon: the logo's own "B" and "V"

Needs Pillow. Like `make-brand-mark.mjs` in the LunArt core, it makes an asset
once and never runs on a phone, so it is not a dependency of the guide.
"""

import base64
import io
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'assets/img/_src/brand/Bella_Vigna_logo_oro_classico.jpg')

PAPER = (251, 248, 242)
PAPER_DEEP = (238, 228, 208)
GOLD = (152, 112, 40)
LAYOUT = (708, 501)


def out(*parts):
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def trim(im):
    box = im.getchannel('A').point(lambda a: 255 if a > 12 else 0).getbbox()
    return im.crop(box) if box else im


def components(im):
    """Connected shapes of ink (8-connectivity), each as (label, size, bbox)."""
    mask = np.array(im.getchannel('A')) > 30
    height, width = mask.shape
    labels = np.zeros((height, width), dtype=np.int32)
    found = []
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or labels[y, x]:
                continue
            label = len(found) + 1
            labels[y, x] = label
            queue = deque([(y, x)])
            size, x0, y0, x1, y1 = 0, x, y, x, y
            while queue:
                cy, cx = queue.popleft()
                size += 1
                x0, y0, x1, y1 = min(x0, cx), min(y0, cy), max(x1, cx), max(y1, cy)
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not labels[ny, nx]:
                            labels[ny, nx] = label
                            queue.append((ny, nx))
            found.append((label, size, (x0, y0, x1 + 1, y1 + 1)))
    return labels, found


def keep(im, labels, wanted):
    """The same pixels, with every shape not in `wanted` made transparent."""
    arr = np.array(im)
    arr[~np.isin(labels, list(wanted)), 3] = 0
    return Image.fromarray(arr, 'RGBA')


def fade(im, alpha):
    r, g, b, a = im.split()
    a = a.point(lambda v: int(v * alpha))
    return Image.merge('RGBA', (r, g, b, a))


def gradient(size, top_left, bottom_right):
    w, h = size
    base = Image.new('RGB', size, top_left)
    px = base.load()
    for y in range(h):
        for x in range(w):
            t = (x / w * 0.45) + (y / h * 0.55)
            px[x, y] = tuple(int(top_left[i] + (bottom_right[i] - top_left[i]) * t) for i in range(3))
    return base.convert('RGBA')


def from_original(path):
    """
    The original JPEG's gold, on transparency, framed as the crops below expect.

    The ground is sampled from the border (it is one flat cream). For each pixel,
    alpha is how far it is from that cream towards black, the most any channel
    needs; the colour is what, at that alpha over the cream, gives the original
    pixel back. So the logo shown on the guide's paper is the original, and on
    any other ground it is the same gold. Pixels within JPEG noise of the cream
    are the ground and become fully transparent.
    """
    rgb = np.asarray(Image.open(path).convert('RGB'), dtype=np.float64)
    border = np.concatenate([rgb[:16].reshape(-1, 3), rgb[-16:].reshape(-1, 3),
                             rgb[:, :16].reshape(-1, 3), rgb[:, -16:].reshape(-1, 3)])
    ground = np.median(border, axis=0)
    alpha = np.clip((ground - rgb) / ground, 0, 1).max(axis=2)
    alpha[alpha < 0.02] = 0
    safe = np.where(alpha > 0, alpha, 1)[..., None]
    colour = np.clip((rgb - (1 - alpha[..., None]) * ground) / safe, 0, 255)
    rgba = np.dstack([colour, alpha * 255]).round().astype(np.uint8)
    logo = Image.fromarray(rgba, 'RGBA')
    # Framed on every pixel of ink, faint ones included, as the June copy was.
    logo = logo.crop(logo.getchannel('A').getbbox())

    # The crops in `main` were measured on the same logo framed tight at 708 px
    # wide (the copy the June 2026 page carried): scale to that width, keeping
    # the proportions, and resample premultiplied so no cream fringe returns.
    height = round(LAYOUT[0] * logo.height / logo.width)
    if abs(height - LAYOUT[1]) > 3:
        sys.exit(f'unexpected logo proportions {logo.size}: the crops below are measured on 708x501')
    logo = logo.convert('RGBa').resize((LAYOUT[0], height), Image.LANCZOS).convert('RGBA')
    framed = Image.new('RGBA', LAYOUT, (0, 0, 0, 0))
    framed.alpha_composite(logo, (0, 0))
    return framed


def main():
    logo = from_original(SRC)

    skyline = trim(logo.crop((0, 0, 708, 214)))

    # The script touches nothing but the field strokes of the skyline above it,
    # which are one wide, flat shape: keep every other shape in the band.
    band = logo.crop((0, 190, 708, 412))
    labels, shapes = components(band)
    strokes = {label for label, size, (x0, y0, x1, y1) in shapes if (x1 - x0) > 400 and (y1 - y0) < 60}
    letters = {label for label, size, box in shapes if size > 20 and label not in strokes}
    script = trim(keep(band, labels, letters))
    # The B is the leftmost shape; the V is the first shape that starts past the
    # middle of "Bella", cut before the i that follows it.
    ordered = sorted((s for s in shapes if s[0] in letters and s[1] > 1000), key=lambda s: s[2][0])
    b_label = ordered[0][0]
    v_label = next(s[0] for s in ordered if s[2][0] > 300)
    b_glyph = trim(keep(band, labels, {b_label}))
    v_glyph = trim(keep(band, labels, {v_label}).crop((0, 0, 462, band.height)))

    # The vines either side of "B&B", without the lettering between them.
    foot = logo.crop((30, 404, 708, 501))
    vines = Image.new('RGBA', foot.size, (0, 0, 0, 0))
    vines.alpha_composite(foot.crop((0, 0, 188, foot.height)), (0, 0))
    vines.alpha_composite(foot.crop((462, 0, foot.width, foot.height)), (462, 0))
    vines = trim(vines)

    # ── Wordmark: the script alone reads at header height; the skyline does not.
    mark = script.copy()
    mark.thumbnail((480, 128), Image.LANCZOS)
    mark.save(out('assets/img/brand/bella-vigna-mark.webp'), 'WEBP', quality=92, method=6, lossless=False)

    whole = trim(logo)
    whole.thumbnail((560, 420), Image.LANCZOS)
    whole.save(out('assets/img/brand/bella-vigna-logo.webp'), 'WEBP', quality=90, method=6)

    # ── Pass artwork. 85:55 like the card. Name top-left, details along the
    # bottom, mark top-right: the skyline sits right of centre and the vines
    # run along the foot, faint, so neither text zone has gold under it.
    W, H = 2048, 1325
    card = gradient((W, H), (248, 243, 232), (236, 225, 203))

    sky = skyline.copy()
    sky_w = int(W * .62)
    sky = sky.resize((sky_w, int(sky.height * sky_w / sky.width)), Image.LANCZOS)
    card.alpha_composite(fade(sky, .42), (int(W * .36), int(H * .30)))

    vine = vines.copy()
    vine_w = int(W * .78)
    vine = vine.resize((vine_w, int(vine.height * vine_w / vine.width)), Image.LANCZOS)
    card.alpha_composite(fade(vine, .16), ((W - vine_w) // 2 + int(W * .08), int(H * .70)))

    edge = ImageDraw.Draw(card)
    inset = 26
    edge.rectangle((inset, inset, W - inset, H - inset), outline=GOLD + (70,), width=3)

    flat = card.convert('RGB')
    for width in (1024, 700):
        flat.resize((width, round(width * H / W)), Image.LANCZOS).save(
            out(f'assets/img/pass/bella-vigna-pass-{width}.webp'), 'WEBP', quality=86, method=6)

    # ── "Discover Florence": the logo's skyline in gold on the house's dark ink,
    # so the white caption the card sets over its foot keeps its contrast. The
    # guide has no photograph of Florence that is Bella Vigna's own, and LunArt's
    # are LunArt's.
    FW, FH = 2048, 1365
    night = gradient((FW, FH), (46, 37, 25), (24, 19, 12))
    lit = skyline.copy()
    lit_w = int(FW * .78)
    lit = lit.resize((lit_w, int(lit.height * lit_w / lit.width)), Image.LANCZOS)
    r, g, bl, a = lit.split()
    lit = Image.merge('RGBA', (r.point(lambda v: min(255, int(v * 1.35))), g.point(lambda v: min(255, int(v * 1.3))),
                              bl.point(lambda v: min(255, int(v * 1.2))), a.point(lambda v: int(v * .9))))
    night.alpha_composite(lit, ((FW - lit_w) // 2, int(FH * .16)))
    flat_night = night.convert('RGB')
    for width in (1024, 700, 400):
        flat_night.resize((width, round(width * FH / FW)), Image.LANCZOS).save(
            out(f'assets/img/brand/firenze-{width}.webp'), 'WEBP', quality=84, method=6)
    flat_night.resize((800, round(800 * FH / FW)), Image.LANCZOS).save(
        out('assets/img/brand/firenze-800.jpg'), 'JPEG', quality=80, optimize=True, progressive=True)

    # ── Icon: the logo's own B and V, on paper.
    b, v = b_glyph, v_glyph
    gap = 4
    mono = Image.new('RGBA', (b.width + v.width + gap, max(b.height, v.height)), (0, 0, 0, 0))
    mono.alpha_composite(b, (0, mono.height - b.height))
    mono.alpha_composite(v, (b.width + gap, 0))
    for size in (512, 192, 180):
        icon = Image.new('RGBA', (size, size), PAPER + (255,))
        ring = ImageDraw.Draw(icon)
        pad = round(size * .06)
        ring.ellipse((pad, pad, size - pad, size - pad), outline=GOLD + (200,), width=max(2, size // 90))
        glyph = mono.copy()
        glyph.thumbnail((round(size * .64), round(size * .52)), Image.LANCZOS)
        icon.alpha_composite(glyph, ((size - glyph.width) // 2, (size - glyph.height) // 2))
        icon.convert('RGB').save(out(f'assets/icon-{size}.png'), 'PNG', optimize=True)

    buf = io.BytesIO()
    Image.open(out('assets/icon-192.png')).save(buf, 'PNG', optimize=True)
    data = base64.b64encode(buf.getvalue()).decode('ascii')
    with open(out('assets/icon.svg'), 'w', encoding='utf-8') as svg:
        svg.write(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" role="img" aria-label="Bella Vigna">'
            f'<image width="192" height="192" href="data:image/png;base64,{data}"/></svg>\n'
        )
    print('brand assets written')


if __name__ == '__main__':
    main()
