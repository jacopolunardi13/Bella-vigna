# Bella Vigna — the mark

`bella-vigna-mark.webp` is the "Bella Vigna" script cut out of the classic gold
logo the property supplied (`assets/img/_src/brand/bella-vigna-logo.png`,
recovered unaltered from the June 2026 page in `legacy/index.html`). It is the
file the header, the Pass and the venue card show; the path lives once, in
`data/brand.js` (`brand.mark`).

`bella-vigna-logo.webp` is the whole logo — skyline, script, B&B and vines.

Both are built, with the Pass artwork and the app icons, by:

    python3 -I tools/make-bella-vigna-assets.py

Nothing is redrawn: every output is a crop, a resize or a composition of the
logo's own pixels. To replace the mark, replace the source PNG (same 708 × 501
layout, or update the crops in the script) and run it again.

**To confirm before go-live** (Property Pack §2): that this logo is the approved
brand file. It came from the old page and from a property email, not from a
brand-asset delivery.
