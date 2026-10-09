# Source images — Bella Vigna

The files the guide's images are built from. Nothing here is served directly, and
no LunArt image is kept here or served anywhere.

Everything under `assets/img/<folder>/` is generated from here by:

    python3 -I tools/import-room-photos.py <originals>   # Drive originals → rooms/*.jpg (see below)
    node tools/optimize-images.mjs                        # rooms → 400/700/1024 WebP + 800 JPEG
    python3 -I tools/make-bella-vigna-assets.py           # logo → header mark, Pass artwork, icons

## Logo

`brand/Bella_Vigna_logo_oro_classico.jpg` is the classic gold logo exactly as
Valentina Longo sent it (email of 11 March 2026 to jacopolunardi13@gmail.com,
attachment of the same name): 1024 × 1024, gold on a cream ground, byte for byte
(`test/assets.test.mjs` pins its SHA-256). The guide's versions take the cream
ground out and nothing else (`from_original` in the script).

Two other copies of the same design exist and were compared with it: the
transparent PNG inlined in the June 2026 page (`legacy/index.html`, 708 × 501) and
`logo bv vettoriale 2.png` in the Drive photo folder (1024 × 1024, transparent).
Same drawing, same proportions; both are a darker, browner gold than the email
original, which is why the email file is the source. Despite its name the Drive
file is a raster PNG, not a vector.

## Room photographs

Chosen from the property's Google Drive — the main folder (48 photos, May 2026)
and "nuove foto settembre 2026" (23 photos, June–September 2026) — and imported by
`tools/import-room-photos.py`, which lists each one with its Drive file id. Every
output is upright, stripped of all camera metadata, at most 1600 px, and portrait
originals are cut to the 3:2 frame the room slider uses.

The rooms are told apart by their bathrooms, which match the Property Pack, and
by furniture that recurs in every shot of the same room:

| room | bathroom | furniture |
|---|---|---|
| Standard | caramel tiles, rectangular basin on a dark vanity | window desk with dark top, grey chair, travertine globe pendants |
| Deluxe | green double shower, freestanding basin, arched mirror | open white wardrobe, oak desk, oval brass coffee table, grey-green armchair |
| Terrazza | turquoise shower, stone walls, freestanding basin, oval mirror | exposed beams, French window to the terrace, round white side table, dark armchair |

| file | Drive original | shows |
|---|---|---|
| `rooms/standard-camera.jpg` | main / image00014 | bed, travertine lamps, window desk |
| `rooms/standard-letto.jpg` | settembre / image00012 | bed with caramel cushions (3:2 band from a portrait) |
| `rooms/standard-dotazioni.jpg` | main / image00017 | wall TV, coffee machine, small fridge, luggage rack |
| `rooms/standard-bagno.jpg` | main / image00020 | caramel shower and basin |
| `rooms/standard-doccia.jpg` | main / image00022 | caramel tiles, close |
| `rooms/deluxe-camera.jpg` | main / image00025 | whole room |
| `rooms/deluxe-angolo.jpg` | main / image00037 | armchair, coffee table, desk |
| `rooms/deluxe-scrivania.jpg` | main / image00027 | Nespresso, kettle, cups |
| `rooms/deluxe-doccia.jpg` | main / image00030 | the double shower |
| `rooms/deluxe-bagno.jpg` | main / image00033 | arched mirror, freestanding basin, shower |
| `rooms/terrazza-esterno.jpg` | main / image00010 | the private terrace (also the guide's hero) |
| `rooms/terrazza-camera.jpg` | main / image00004 | bed, side table, armchair |
| `rooms/terrazza-travi.jpg` | main / image00001 | exposed beams and French window (3:2 band from a portrait) |
| `rooms/terrazza-accesso.jpg` | main / image00006 | armchair corner by the French window |
| `rooms/terrazza-doccia.jpg` | settembre / image00001 | turquoise shower |
| `rooms/terrazza-bagno.jpg` | main / image00045 | stone walls, freestanding basin |

The June page's "Bagno Camera 1" (stone walls, oval mirror) is Drive main /
image00042, the same bathroom as the turquoise shower in image00043–48: the doubt
between the page and the Property Pack is settled, the terrace bathroom is both.

Not used, and why:
- main 12–13: corridors; main 02, 18: coffee corners close to ones already shown;
- settembre 14–15, 18–21: the terrace and the terrace room with a model — a guest
  guide shows the room, not a campaign;
- settembre 22–23: breakfast on the Opera Caffè terrace facing the Duomo (the
  napkin carries the l'Opera logo). The guide has no place for a photograph on the
  breakfast page yet, and the Opera Caffè agreement for Bella Vigna is still to be
  confirmed (go-live D1).
