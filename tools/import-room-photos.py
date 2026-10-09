"""
Room photographs: from the property's Drive originals to `assets/img/_src/rooms/`.

    python3 -I tools/import-room-photos.py <folder-with-originals>
    python3 -I tools/import-room-photos.py --urls      # where to download them
    node tools/optimize-images.mjs                     # then: 400/700/1024 WebP + 800 JPEG

The originals are the property's own photographs in its Google Drive (the main
folder and "nuove foto settembre 2026"): 4–6k pixels, 4–20 MB, with camera
metadata. They are never committed. This script keeps the chosen ones, each saved
in the folder above as `<drive-id>.jpg` (both Drive folders number their files
from image00001, so the Drive name alone is ambiguous).

Every output is:
  - upright (EXIF orientation applied), then stripped of every metadata block —
    camera, date and position never reach the repository or a guest's phone;
  - at most 1600 px on its long side, which is 1.5x the widest variant served;
  - a 3:2 frame when the original is portrait, cut where `top` says. The room
    slider shows every photograph at 3:2 (`.slider__slide img`): a centred crop
    of a portrait shot keeps the middle of the wall and loses the bed, so the
    band is chosen here, by eye, once. Landscape originals keep their frame.

The file name carries the room (`rooms/<room>-…`), and `test/data.test.mjs`
holds every gallery to it: re-attributing a photograph means renaming it here.
"""

import os
import sys

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets/img/_src/rooms')
LONG_SIDE = 1600

# (output name, Drive folder, Drive file name, Drive file id, top of the 3:2 band
# as a fraction of the height that can be cut away; None = keep the frame).
# Room attribution: Standard has the caramel bathroom, Deluxe the green double
# shower, the terrace room the turquoise shower and the exposed beams — each
# matched against the room's own furniture across both folders.
PHOTOS = [
    ('standard-camera',    'main',      'image00014.jpeg', '1MACkOiiPI7W2PkVqvVhCvrLPeBaA9wjF', None),
    ('standard-letto',     'settembre', 'image00012.jpeg', '10V3zGM9AVPBAfPE-NfBAaG5a1YbAdQdK', 0.92),
    ('standard-dotazioni', 'main',      'image00017.jpeg', '16EBVjz5Abu5W36AEMM2-X6K6yyxxaOoo', None),
    ('standard-bagno',     'main',      'image00020.jpeg', '1m5g-1_tbFOwn69fvJd_EZJ1WLcaUTKTh', None),
    ('standard-doccia',    'main',      'image00022.jpeg', '16y_TK5Hs-JheE8NyA4MFpFrU9PpzFl7q', None),

    ('deluxe-camera',      'main',      'image00025.jpeg', '1n4WLHiOfjbDRnWsVQaUntLIeR4jeGJ3C', None),
    ('deluxe-angolo',      'main',      'image00037.jpeg', '1AkVzZtnT2CAJ_GMYrRPNYA6ozHFODjF3', None),
    ('deluxe-scrivania',   'main',      'image00027.jpeg', '14AM8k0C1sgTVKJJwGo0OWDpr1cizLOTV', None),
    ('deluxe-doccia',      'main',      'image00030.jpeg', '1zFkpmqxrmpn8Gvz_5ljAxVSRdkthXba4', None),
    ('deluxe-bagno',       'main',      'image00033.jpeg', '14g96KawQKBQ9Yp83fetC_m9_dKLTic2z', None),

    ('terrazza-esterno',   'main',      'image00010.jpeg', '1QgcPdd9N5AeFucQxJ3cTbgOgfecwVJZJ', None),
    ('terrazza-camera',    'main',      'image00004.jpeg', '1880zTsYNvq-jsLVCJKdSzfujWXQjnHXc', None),
    ('terrazza-travi',     'main',      'image00001.jpeg', '1XBpNrTvyd41h8MNLJZ8XXvpdyitbBimO', 0.20),
    ('terrazza-accesso',   'main',      'image00006.jpeg', '1v9RHloflBcsq47O57_t1irXPl5u3ESdB', None),
    ('terrazza-doccia',    'settembre', 'image00001.jpeg', '1cYDpwb5EGwoW12b52EVZRUte554RhKke', None),
    ('terrazza-bagno',     'main',      'image00045.jpeg', '10Q2i9vN3g9NCr91hrx37L3ZwUafuacWY', None),
]


def band(im, top):
    """The 3:2 band of a portrait image starting `top` of the way down."""
    w, h = im.size
    bh = round(w * 2 / 3)
    if bh >= h:
        return im
    y = round((h - bh) * top)
    return im.crop((0, y, w, y + bh))


def convert(src, dst, top):
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im).convert('RGB')
    if top is not None:
        im = band(im, top)
    im.thumbnail((LONG_SIDE, LONG_SIDE), Image.LANCZOS)
    # A fresh image carries no EXIF, XMP or ICC block from the camera.
    clean = Image.new('RGB', im.size)
    clean.paste(im)
    clean.save(dst, 'JPEG', quality=86, optimize=True, progressive=True)
    return clean.size


def main(argv):
    if argv[1:] == ['--urls']:
        for name, folder, drive_name, file_id, _ in PHOTOS:
            print(f'{file_id}.jpg  {name:<20} {folder}/{drive_name}  '
                  f'https://drive.google.com/uc?export=download&id={file_id}')
        return 0
    if len(argv) != 2:
        print(__doc__.strip().splitlines()[2], file=sys.stderr)
        return 2
    folder = argv[1]
    missing = [f'{file_id}.jpg ({name})' for name, _, _, file_id, _ in PHOTOS
               if not os.path.exists(os.path.join(folder, f'{file_id}.jpg'))]
    if missing:
        print('missing originals:\n  ' + '\n  '.join(missing), file=sys.stderr)
        return 1
    os.makedirs(OUT, exist_ok=True)
    for name, _, drive_name, file_id, top in PHOTOS:
        size = convert(os.path.join(folder, f'{file_id}.jpg'), os.path.join(OUT, f'{name}.jpg'), top)
        print(f'rooms/{name}.jpg  {size[0]}x{size[1]}  <- {drive_name}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
