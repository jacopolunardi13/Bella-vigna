/**
 * The files the stylesheets and the code actually ask for.
 *
 * This suite exists because of a bug that was invisible in every other one. The Pass
 * set its artwork through an inline `--pass-artwork` custom property, and a relative
 * `url()` inside a custom property resolves against the *stylesheet* that consumes
 * it rather than the element — so `assets/img/pass/…` was fetched as
 * `/assets/css/assets/img/pass/…`. The dev server answers `200 text/html` for any
 * unknown path, so the browser received a page where an image should have been,
 * reported nothing, and painted an empty layer. The card looked generic for weeks
 * and no test, no console and no network panel said why.
 *
 * So: every asset a stylesheet references is resolved the way a browser would
 * resolve it, and checked against the disk.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, stat } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const exists = async (path) => { try { await access(path); return true; } catch { return false; } };

const STYLESHEETS = ['assets/css/app.css', 'assets/css/staff.css', 'assets/css/fonts.css'];

/**
 * A stylesheet with its comments taken out.
 *
 * These checks scan for CSS constructs, and a comment is not one. Without this, the
 * custom-property rule below matched the sentence in `app.css` that *explains* the
 * custom-property rule — prose containing the words `--pass-wash-top` and `url()`
 * with no semicolon between them. The blanking keeps the line numbering, so a
 * failure still points at the right line.
 */
const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '));

/** Every `url(...)` in a stylesheet, with the line it was on. */
function urlsIn(css) {
  const found = [];
  css.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      found.push({ url: match[1].trim(), line: index + 1 });
    }
  });
  return found;
}

test('every asset a stylesheet asks for is actually there', async () => {
  for (const sheet of STYLESHEETS) {
    const css = withoutComments(await readFile(resolve(ROOT, sheet), 'utf8'));
    for (const { url, line } of urlsIn(css)) {
      if (/^(data:|https?:|#)/.test(url)) continue;
      // Resolved against the stylesheet's own folder, which is what a browser does.
      const target = resolve(ROOT, dirname(sheet), url);
      assert.ok(
        await exists(target),
        `${sheet}:${line} asks for ${url}, which resolves to ${relative(ROOT, target)} and is not there`,
      );
    }
  }
});

test('no stylesheet asset is addressed through a custom property', async () => {
  /**
   * The bug this file was written for.
   *
   * `background-image: var(--something)` where the variable was set inline carries a
   * relative URL that resolves against the wrong base. It is legal CSS, it throws
   * nothing, and it silently fetches the wrong path — so the rule is simply that
   * asset URLs live in the stylesheet, where the base is the stylesheet's own.
   */
  for (const sheet of STYLESHEETS) {
    const css = withoutComments(await readFile(resolve(ROOT, sheet), 'utf8'));
    // `{` is excluded as well as `;` and `}`: without it the pattern walks out of a
    // selector like `.pass--privilege::before` and into the rule it opens.
    for (const [, name, value] of css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]*url\([^;{}]*)/g)) {
      assert.fail(`${sheet}: ${name} carries a url() (${value.trim().slice(0, 60)}…) — put it in a rule, not a variable`);
    }
  }
});

test('the Pass wears the artwork, at both densities', async () => {
  // Bella Vigna's card is composed from the property's own logo — its skyline and
  // its vines in gold on warm paper — by a script that is committed with its source,
  // so it can be rebuilt or re-framed rather than edited by hand.
  assert.ok(await exists(resolve(ROOT, 'assets/img/_src/brand/Bella_Vigna_logo_oro_classico.jpg')), 'the logo the artwork is cut from is kept');
  assert.ok(await exists(resolve(ROOT, 'tools/make-bella-vigna-assets.py')), 'and so is the recipe');

  // The two widths the card actually uses: 1x on a plain screen, 2x on a phone.
  for (const width of [700, 1024]) {
    assert.ok(await exists(resolve(ROOT, `assets/img/pass/bella-vigna-pass-${width}.webp`)), `bella-vigna-pass-${width}.webp`);
  }

  // Nothing heavy reaches a guest. The 1024 is what a dense phone takes.
  const { size } = await stat(resolve(ROOT, 'assets/img/pass/bella-vigna-pass-1024.webp'));
  assert.ok(size < 160 * 1024, `the served artwork stays small (${(size / 1024).toFixed(0)} KB)`);
});

test('only the artwork in use is served', async () => {
  // LunArt's painting is LunArt's: none of its files may travel with this guide.
  const { readdir } = await import('node:fs/promises');
  const served = await readdir(resolve(ROOT, 'assets/img/pass'));
  const stems = new Set(served.map((f) => f.replace(/-\d+\.(webp|jpg)$/, '')));
  assert.deepEqual([...stems].sort(), ['bella-vigna-pass'], 'one artwork in the served tree');
});

test('no LunArt image travels with the Bella Vigna guide', async () => {
  // Property Pack §2: Bella Vigna's own photographs only. A LunArt file name anywhere
  // under assets/img would be a LunArt picture shown to a Bella Vigna guest.
  const { readdir } = await import('node:fs/promises');
  const walk = async (dir) => (await Promise.all((await readdir(dir, { withFileTypes: true }))
    .map((e) => (e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)])))).flat();
  const files = (await walk(resolve(ROOT, 'assets/img'))).map((f) => relative(ROOT, f));
  assert.deepEqual(files.filter((f) => /lunart|arno|ponte-vecchio|30[1-6]-/i.test(f)), []);
});

test('one artwork serves every card face', async () => {
  /**
   * Privilege used to have a plate of its own, which made it a different card rather
   * than the same card upgraded. The rule is structural: every rule that paints a
   * card face points at the same file, and the tier is carried by the edge and the
   * chip. The file is not named here — that is the point, so the artwork can change
   * without this test needing an edit.
   */
  const css = await readFile(resolve(ROOT, 'assets/css/app.css'), 'utf8');
  const faces = [...css.matchAll(/\.(pass|privilege-card)::before\s*\{[^}]*\}/gs)].map((m) => m[0]);
  assert.equal(faces.length, 2, 'the Pass and the venue card are the two faces');

  const artwork = faces.map((face) => [...face.matchAll(/([\w-]+)-\d+\.webp/g)].map((m) => m[1]));
  assert.ok(artwork[0].length >= 2, 'each face names the artwork at 1x and 2x');
  assert.deepEqual(new Set(artwork.flat()).size, 1, 'and both faces name the same artwork');
});

test('the card ink and the washes are each defined once', async () => {
  /**
   * Both were written out twice — in `.pass` and again in `.privilege-card`, and in
   * `.pass::after` and `.pass--privilege::after`. Changing one copy for a new artwork
   * left the other at the old value and measured as no change at all, twice.
   */
  const css = await readFile(resolve(ROOT, 'assets/css/app.css'), 'utf8');
  for (const token of ['--pass-ink', '--pass-ink-soft', '--pass-ink-quiet', '--pass-wash-top', '--pass-wash-bottom']) {
    const declarations = css.match(new RegExp(`^\\s*${token}\\s*:`, 'gm')) ?? [];
    assert.equal(declarations.length, 1, `${token} is declared once, not ${declarations.length} times`);
  }
});

test('the brand mark hook and its README agree on one path', async () => {
  // The path is no longer a literal in the hook: it is the property's, in
  // `data/brand.js`, which the header, the Pass and the venue card all read.
  const { brand } = await import('../data/brand.js');
  const { BRAND_WORDMARK } = await import('../src/ui/brand.js');
  assert.equal(BRAND_WORDMARK, brand.mark);
  assert.equal(BRAND_WORDMARK, 'assets/img/brand/bella-vigna-mark.webp');

  const readme = await readFile(resolve(ROOT, 'assets/img/brand/README.md'), 'utf8');
  assert.ok(
    readme.includes('bella-vigna-mark.webp'),
    'the README names the file the code looks for, so the person providing it has one answer',
  );
});

test('the Bella Vigna mark is there, and is the logo’s own script', async () => {
  /**
   * The header mark is the "Bella Vigna" script cut out of the classic gold logo —
   * not redrawn, not set in a font that looks close. Its proportions are the
   * script's own (about 3.8 : 1), which is what lets the header size it by height.
   */
  const file = resolve(ROOT, 'assets/img/brand/bella-vigna-mark.webp');
  assert.ok(await exists(file), 'the mark is committed');
  const bytes = await readFile(file);
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', 'it is a WebP');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
  // VP8X carries the canvas size (24-bit, minus one) at bytes 24–29 when alpha is present.
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'VP8X', 'with an alpha channel, so it sits on any paper');
  const width = 1 + bytes.readUIntLE(24, 3);
  const height = 1 + bytes.readUIntLE(27, 3);
  const ratio = width / height;
  assert.ok(ratio > 3.4 && ratio < 4.2, `the script's own proportions are preserved (${ratio.toFixed(2)}:1)`);

  // The source it was cut from is kept, so it can be rebuilt or replaced.
  assert.ok(await exists(resolve(ROOT, 'assets/img/_src/brand/Bella_Vigna_logo_oro_classico.jpg')), 'the original is kept');
});

/**
 * The logo is the file the property sent (Valentina Longo, email of 11 March 2026),
 * byte for byte: the guide's versions are derived from it by a script, and the
 * original itself is never re-saved, re-cropped or re-coloured.
 */
test('the original logo is kept exactly as it was delivered', async () => {
  const { createHash } = await import('node:crypto');
  const bytes = await readFile(resolve(ROOT, 'assets/img/_src/brand/Bella_Vigna_logo_oro_classico.jpg'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    'cdfc4044106121274100b507846bcc3bd15e8d126e1eccc9ad327ddc7a73eb3c');
});

/** The chunk ids of a WebP file (RIFF: id, little-endian size, payload padded to even). */
function webpChunks(bytes) {
  const ids = [];
  for (let at = 12; at + 8 <= bytes.length; at += 8 + bytes.readUInt32LE(at + 4) + (bytes.readUInt32LE(at + 4) % 2)) {
    ids.push(bytes.subarray(at, at + 4).toString('ascii'));
  }
  return ids;
}

/**
 * Room photographs carry no camera metadata: an iPhone original holds the date,
 * the device and often the position, and none of it belongs on a guest's phone.
 */
test('no room photograph carries EXIF metadata', async () => {
  const { readdir } = await import('node:fs/promises');
  const dirs = ['assets/img/_src/rooms', 'assets/img/rooms'];
  const tagged = [];
  for (const dir of dirs) {
    for (const name of await readdir(resolve(ROOT, dir))) {
      if (!/\.(jpe?g|webp)$/.test(name)) continue;
      const bytes = await readFile(resolve(ROOT, dir, name));
      if (name.endsWith('.webp') ? webpChunks(bytes).some((id) => id === 'EXIF' || id === 'XMP ')
        : bytes.includes(Buffer.from('Exif\0\0', 'latin1'))) tagged.push(`${dir}/${name}`);
    }
  }
  assert.deepEqual(tagged, []);
});

test('the custom-property rule would catch the bug it was written for', async () => {
  // A guard on the guard: the first version of this check walked out of the selector
  // `.pass--privilege::before` and failed on it, which is the kind of false positive
  // that gets a test deleted rather than fixed.
  const { readFile: read } = await import('node:fs/promises');
  const real = withoutComments(await read(resolve(ROOT, 'assets/css/app.css'), 'utf8'));
  const offending = /(--[\w-]+)\s*:\s*([^;{}]*url\([^;{}]*)/g;

  assert.equal(real.match(offending), null, 'the real stylesheet is clean');
  assert.ok(
    withoutComments('.a { /* --x: url(y.png) */ color: red; }').match(offending) === null,
    'and a url() named inside a comment is prose, not a declaration',
  );
  assert.ok(
    ".pass { --pass-artwork: url('../img/x.webp'); }".match(offending),
    'and the pattern still catches an asset hidden in a variable',
  );
  assert.equal(
    '.pass--privilege::before { background-image: url("../img/x.webp"); }'.match(offending),
    null,
    'while leaving a double-dash class name alone',
  );
});
