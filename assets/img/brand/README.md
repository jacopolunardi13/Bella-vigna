# Bella Vigna — the mark

`bella-vigna-mark.webp` is the "Bella Vigna" script cut out of the classic gold
logo the property supplied: `assets/img/_src/brand/Bella_Vigna_logo_oro_classico.jpg`,
the file Valentina Longo sent by email on 11 March 2026, kept byte for byte. It is
the file the header, the Pass and the venue card show; the path lives once, in
`data/brand.js` (`brand.mark`).

`bella-vigna-logo.webp` is the whole logo — skyline, script, B&B and vines.

Both are built, with the Pass artwork, the "Scopri Firenze" card and the app
icons, by:

    python3 -I tools/make-bella-vigna-assets.py

Nothing is redrawn: the script takes out the cream ground of the original (each
pixel keeps the gold that, over that cream, gives the original back), then every
output is a crop, a resize or a composition of those pixels. Proportions,
lettering, symbols and colours are the original's.

**To confirm before go-live** (Property Pack §2, go-live A14): that this file is
the approved brand logo. It is the version sent by the property; a darker copy of
the same drawing is in the June 2026 page and in the Drive photo folder
(`logo bv vettoriale 2.png`, a raster PNG despite the name). No vector file
(SVG/PDF/AI) has been found: for print, ask the designer for one.
