# Source photographs — Bella Vigna

These are the original files, recovered byte for byte from the base64 blobs inlined
in the June 2026 page (`legacy/index.html`). They are the only copies this repository
holds, so they stay even though nothing serves them directly. No LunArt photograph
is kept here or served anywhere.

Everything under `assets/img/<folder>/` is generated from here by:

    node tools/optimize-images.mjs                 # photographs → 400/700/1024 WebP + 800 JPEG
    python3 -I tools/make-bella-vigna-assets.py    # logo → header mark, Pass artwork, icons

## Attribution

Each photograph was captioned with its room on the June page, and the file name now
carries that attribution (`rooms/<room>-…`):

| file | room | caption on the June page |
|---|---|---|
| `rooms/standard-camera.jpg` | Standard | Camera Classica |
| `rooms/standard-bagno.jpg` | Standard | Bagno Camera 2 |
| `rooms/deluxe-camera.jpg` | Deluxe | Camera con Doccia Doppia |
| `rooms/deluxe-doccia.jpg` | Deluxe | Doccia doppia Camera 3 |
| `rooms/deluxe-bagno.jpg` | Deluxe | Bagno Camera 3 |
| `rooms/deluxe-angolo.jpg` | Deluxe | Interior Bella Vigna (same armchair and table as the Deluxe room) |
| `rooms/terrazza-esterno.jpg` | Terrazza | Terrazza privata Bella Vigna |
| `rooms/terrazza-camera.jpg` | Terrazza | Camera con Terrazza |
| `rooms/terrazza-letto.jpg` | Terrazza | Camera con travi a vista |
| `rooms/terrazza-bagno.jpg` | Terrazza | Bagno Camera 1 — **doubtful**: the Property Pack describes this bathroom as turquoise |

`brand/bella-vigna-logo.png` is the classic gold logo (708 × 501, transparent).

The Drive folder "nuove foto settembre 2026" could not be read when this guide was
built; when its photographs are approved, drop them here under a room name and run
the scripts above.
