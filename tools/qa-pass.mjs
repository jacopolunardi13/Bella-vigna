#!/usr/bin/env node
/**
 * The money path, end to end, in a real browser.
 *
 * Everything else tests a piece of this; only this walks it the way a guest does:
 * open the personal link, put a bottle in the basket, pay, come back, and find the
 * order where it should be. It exists because the pieces all passed while the
 * journey did not — the basket was never emptied, the order sat on "in attesa di
 * pagamento", and paying dropped the guest onto a guide that no longer knew them.
 *
 * The last check is the one that matters most: a browser that has never seen this
 * stay opens the same link and still finds the purchase. That is only true because
 * the server, not localStorage, is what remembers.
 *
 * At Bella Vigna the Pass comes with the stay exactly as at LunArt, and everything
 * about it is walked here — the card, its artwork and legibility, its sheet, its
 * states, a cancelled stay, the purchases under it. What cannot be walked is the
 * Privilege upgrade: the partner venues are LunArt's, none has yet confirmed an
 * agreement that covers Bella Vigna guests (`PROPERTY_AGREEMENTS`), so no benefit
 * is claimable and the upgrade is withheld everywhere, preview included. Every
 * check that used to buy it now checks that withholding instead — on the screen and
 * at the checkout — and the upgraded card, its QR and the venue's verdict are left
 * to the unit tests, which prove them against a property fixture
 * (test/pass.test.mjs, test/privilege-card.test.mjs, test/card.test.mjs,
 * test/card-qr-slot.test.mjs, test/partners.test.mjs).
 *
 *   npm run dev &
 *   npm run qa:pass        (BASE_URL and STAFF_TOKEN are read from the environment)
 */
import { chromium, devices } from 'playwright';
import { readdir } from 'node:fs/promises'; import { existsSync } from 'node:fs'; import { join } from 'node:path';
import { brand, storageKey } from '../data/brand.js';
async function launch(){try{return await chromium.launch()}catch(e){const r=process.env.PLAYWRIGHT_BROWSERS_PATH;for(const d of (await readdir(r)).filter(x=>x.startsWith('chromium-'))){const p=join(r,d,'chrome-linux','chrome');if(existsSync(p))return chromium.launch({executablePath:p})}throw e}}
const B=(process.env.BASE_URL??'http://localhost:4173').replace(/\/$/,'');
// The staff routes are guarded whenever the server has a token: present it, from the environment.
const STAFF_TOKEN=process.env.STAFF_TOKEN??'';
const post=(p,b={})=>fetch(`${B}${p}`,{method:'POST',headers:{'content-type':'application/json',...(STAFF_TOKEN&&p.startsWith('/api/staff/')?{authorization:`Bearer ${STAFF_TOKEN}`}:{})},body:JSON.stringify(b)}).then(r=>r.json());
const inDays=n=>new Date(Date.now()+n*864e5).toISOString().slice(0,10);
/** Bella Vigna's rooms have names; and what the browser keeps, it keeps under `bellavigna.`. */
const ROOM='Deluxe';
const KEYS={cart:storageKey('cart.v1'),pending:storageKey('checkout-pending.v1'),orders:storageKey('orders.v1')};
const made=await post('/api/staff/reservations',{first_name:'Flow',last_name:`F${Date.now().toString(36).slice(-4)}`,guest_email:'f@example.invalid',check_in:inDays(30),check_out:inDays(33),room:ROOM,adults:2,booking_reference:`FLOW-${Date.now()}`});
const {link}=await post(`/api/staff/reservations/${made.reservation.id}/link`);
const b=await launch(); const ctx=await b.newContext({...devices['iPhone 13'],locale:'it-IT'}); const page=await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
let failures=0;
const step=(n,ok,extra='')=>{ if(!ok) failures++; console.log(`${ok?'ok  ':'FAIL'}  ${n}${extra?' — '+extra:''}`); };

await page.goto(link,{waitUntil:'networkidle'}); await page.waitForTimeout(2000);
step('the Pass is on the home before anything is bought', await page.locator('[data-pass]').isVisible());
step('and no purchases section yet', (await page.locator('.purchase').count())===0);

// Put a bottle in the basket through the real product sheet.
await page.goto(`${link}#/product/wine-in-room`,{waitUntil:'networkidle'}); await page.waitForTimeout(1500);
await page.locator('.chip--choice').first().click().catch(()=>{});
await page.waitForTimeout(400);
const dateInput = page.locator('.product-form input[type="date"]').first();
if (await dateInput.count()) { await dateInput.fill(new Date(Date.now()+31*864e5).toISOString().slice(0,10)); await page.waitForTimeout(700); }
const slot = page.locator('.product-form select').last();
if (await slot.count()) { const opts = await slot.locator('option').all(); if (opts.length>1) await slot.selectOption({index:1}); await page.waitForTimeout(400); }
const room = page.locator('.product-form [name="room"]');
if (await room.count()) await room.fill(ROOM).catch(()=>{});
await page.locator('.product-form button[type="submit"], [data-add]').first().click().catch(()=>{});
await page.waitForTimeout(1200);
const inCart = await page.evaluate((k)=>JSON.parse(localStorage.getItem(k)||'[]').length, KEYS.cart);
step('the bottle is in the basket', inCart>0, `${inCart} line(s)`);

// Check out.
await page.goto(`${link}#/cart`,{waitUntil:'networkidle'}); await page.waitForTimeout(1200);
await page.fill('.checkout-form [name="name"]','Flow Ospite').catch(()=>{});
await page.fill('.checkout-form [name="email"]','flow@example.invalid').catch(()=>{});
await page.locator('.checkout-form button[type="submit"]').click();
await page.waitForTimeout(2500);
step('we reach the payment page', page.url().includes('mock-checkout')||page.url().includes('stripe'), page.url().slice(0,70));

// Pay.
await page.locator('button:has-text("Paga"), button:has-text("Pay"), [data-pay]').first().click().catch(()=>{});
await page.waitForTimeout(3000);
step('and come back to the guide', page.url().includes('/g/')||page.url().includes('#/order/'), page.url().slice(0,70));
await page.waitForTimeout(2500);

const after = await page.evaluate((k)=>({
  cart: JSON.parse(localStorage.getItem(k.cart)||'[]').length,
  pending: localStorage.getItem(k.pending),
  body: document.body.innerText,
}), KEYS);
step('the basket is empty', after.cart===0, `${after.cart} line(s)`);
step('and the pending marker is consumed', after.pending===null);
step('the order is not still "in attesa di pagamento"', !/in attesa di pagamento/i.test(after.body));

await page.goto(link,{waitUntil:'networkidle'}); await page.waitForTimeout(2500);
const home = await page.evaluate(()=>({
  purchases: document.querySelectorAll('.purchase').length,
  text: document.querySelector('.purchases')?.innerText ?? '',
  pass: !!document.querySelector('[data-pass]'),
}));
step('"I miei acquisti" shows it on the home', home.purchases>0, home.text.replace(/\s+/g,' ').slice(0,80));
step('and the Pass is still there', home.pass);

/* ── The card has to look like a card ──────────────────────────────────────
   The artwork used to be set through an inline custom property, which resolves a
   relative url() against the stylesheet rather than the element — so it silently
   fetched the wrong path, this server answered it with HTML and a 200, and the
   card drew an empty layer for weeks. Checking the CSS is not enough: this checks
   that the bytes arrived and that they were an image. */
const plate = await page.evaluate(async () => {
  const el = document.querySelector('[data-pass]');
  const url = getComputedStyle(el, '::before').backgroundImage.match(/url\("([^"]+)"/)?.[1];
  if (!url) return { url: null };
  const res = await fetch(url);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob).catch(() => null);
  return { url, status: res.status, type: res.headers.get('content-type'), w: bitmap?.width ?? 0 };
});
step('the Pass has a plate behind it', Boolean(plate.url), plate.url ?? 'no background-image');
/**
 * And it says whose card it is.
 *
 * At LunArt the painting carried no mark, so the card printed the LA lock-up. Bella
 * Vigna's plate is the terrace and its vines — no mark in it either — so the card
 * wears the property's own gold mark (`brand.mark`), the same file as the header.
 * And nothing on it may be LunArt's: a second house's card with the first house's
 * picture is the leak this guards.
 */
const mark = await page.evaluate(() => {
  const img = document.querySelector('[data-pass] .pass__mark');
  return img ? { src: img.getAttribute('src'), alt: img.getAttribute('alt'), decoded: img.naturalWidth > 0 } : null;
});
step('and the Bella Vigna mark on it', mark?.decoded === true && mark?.src === brand.mark && mark?.alt === brand.name,
  `${mark?.src ?? 'absent'} · alt ${mark?.alt}`);
step('and nothing on the card is LunArt\u2019s', !/lunart/i.test(`${plate.url} ${mark?.src}`) && plate.url?.includes('bella-vigna-pass'),
  `${plate.url?.split('/').pop()} · ${mark?.src?.split('/').pop()}`);
/** Whatever the artwork is, every other card face has to be wearing the same one. */
const STANDARD_PLATE = plate.url?.match(/[^/]+\.webp/)?.[0] ?? '';
step('and the plate is a real image, not the server’s fallback page',
  plate.w > 0 && /image\//.test(plate.type ?? ''), `${plate.status} ${plate.type} ${plate.w}px`);

/* ── Tapping it opens something useful ─────────────────────────────────── */
await page.locator('[data-pass]').click();
await page.waitForTimeout(900);
const sheet = await page.evaluate(() => ({
  open: Boolean(document.querySelector('.sheet[data-open="true"]')),
  title: document.querySelector('.sheet__title')?.textContent.trim() ?? '',
  facts: [...document.querySelectorAll('.pass-facts__row')].map((r) => r.innerText.replace(/\s+/g,' ').trim()),
  cardInSheet: document.querySelectorAll('.sheet [data-pass]').length,
  // Benefit cards only — the network catalogue below is counted separately.
  benefits: document.querySelectorAll('.sheet .benefit').length,
  partners: document.querySelectorAll('.sheet .partner:not(.partner--network)').length,
  labels: [...document.querySelectorAll('.sheet .pass__label')].map((e) => e.textContent.trim()),
  sections: [...document.querySelectorAll('.sheet .pass__label')].map((e) => e.dataset.section ?? ''),
  locked: document.querySelectorAll('.sheet .partner[data-access="locked"]').length,
  available: document.querySelectorAll('.sheet .partner[data-access="available"]').length,
  headlines: [...document.querySelectorAll('.sheet .benefit__headline')].map((e) => e.textContent.trim()),
  /** Blue Velvet: one venue with two benefits at LunArt. */
  blueVelvet: (() => {
    const card = document.querySelector('.sheet .partner--network[data-partner="blue-velvet"]');
    return card ? { status: card.dataset.status, benefits: card.querySelectorAll('.benefit').length,
      soon: card.querySelector('.partner__soon')?.textContent.trim() ?? '' } : null;
  })(),
  text: document.querySelector('.sheet')?.innerText ?? '',
  hash: location.hash,
}));
step('tapping the Pass opens a view of its own', sheet.open && sheet.cardInSheet===1, sheet.title);
step('it names the holder, the room and the validity',
  sheet.facts.length>=3 && /Flow/.test(sheet.facts.join(' ')) && sheet.facts.some((f)=>f.includes(ROOM)),
  sheet.facts.join(' · ').slice(0,90));
step('with a URL the back button can close', sheet.hash==='#/pass', sheet.hash);

/* ── What the Pass is good for, at Bella Vigna today ──────────────────────
   At LunArt the sheet listed what the stay includes (the Opera Caffè 30%) and,
   under it, the Privilege benefits a standard guest could discover, dimmed and
   marked as an upgrade. At Bella Vigna neither exists yet: the agreements are
   LunArt's, and until a venue confirms one for this house there is nothing to
   claim and nothing to upgrade to. So the sheet must not pretend otherwise — no
   benefit card, no headline that reads as an offer, no padlock and no sentence
   telling a guest to show a card — and the network is still there, as one list of
   businesses being set up, so the guest knows what is coming. */
step('the Pass sheet has no stay-benefit and no Privilege section, only the network',
  sheet.sections.join(',')==='network' && sheet.benefits===0 && sheet.partners===0,
  `${sheet.labels.join(' | ')} · ${sheet.benefits} benefits, ${sheet.partners} benefit cards`);
step('a Pass that has not started yet offers nothing as claimable today',
  sheet.locked===0 && sheet.available===0, `${sheet.locked} locked, ${sheet.available} available`);
step('no benefit headline and no discount figure reads as an offer',
  sheet.headlines.length===0 && !/\d+\s*%|€\s?\d|\d\s?€/.test(sheet.text),
  sheet.headlines.join(' · ') || 'none');
step('Blue Velvet, two benefits at LunArt, is listed with none: being set up',
  sheet.blueVelvet?.status==='activating' && sheet.blueVelvet?.benefits===0 && /in attivazione/i.test(sheet.blueVelvet?.soon ?? ''),
  JSON.stringify(sheet.blueVelvet));
step('and nobody is told to show a card that cannot be bought',
  !/Mostra la tua|Disponibile con|si sbloccano con/i.test(sheet.text));
step('and no internal partner note is anywhere in the Pass',
  !/ingressi adiacenti|listino|attivo per LunArt|accordo LunArt|da confermare/i.test(sheet.text) && /14R–16R/.test(sheet.text),
  'address kept, operational note and agreement status gone');
await page.screenshot({path:'tools/.qa-screens/pass-sheet.png'});

console.log('');
const today = await post('/api/staff/reservations',{first_name:'Live',last_name:`L${Date.now().toString(36).slice(-4)}`,guest_email:'l@example.invalid',check_in:inDays(0),check_out:inDays(2),room:'Terrazza',adults:2,booking_reference:`LIVE-${Date.now()}`});
const liveLink = (await post(`/api/staff/reservations/${today.reservation.id}/link`)).link;

/**
 * Open `#/pass` at a given width and read the partner blocks out of it.
 *
 * Its own context each time, in Italian, because the copy under test is Italian and
 * a desktop default would read the English strings. The link is opened first and the
 * hash set afterwards: navigating straight to `#/pass` races the guest context, and
 * a route that finds no Pass correctly rewrites itself back to the guide.
 */
async function passSheetAt(width, url = liveLink) {
  const probeCtx = await b.newContext({ viewport: { width, height: 900 }, locale: 'it-IT', deviceScaleFactor: 2 });
  const probe = await probeCtx.newPage();
  probe.once('close', () => probeCtx.close().catch(() => {}));
  await probe.goto(url, { waitUntil: 'networkidle' });
  await probe.waitForSelector('[data-pass]', { timeout: 15000 });
  await probe.waitForTimeout(1200);
  await probe.evaluate(() => { location.hash = '#/pass'; });
  await probe.waitForSelector('.sheet .partner', { timeout: 15000 });
  await probe.waitForTimeout(400);
  const read = await probe.evaluate(() => {
    const sheet = document.querySelector('.sheet');
    // The benefit cards only: the network list below is counted on its own.
    const cards = [...sheet.querySelectorAll('.partner:not(.partner--network)')];
    const room = (sheet.querySelector('.sheet__body') ?? sheet).getBoundingClientRect();
    const labels = [...sheet.querySelectorAll('.pass__label')].map((e) => e.textContent.trim());
    // Everything between the Privilege *benefits* heading and the next one is its
    // section. By its own hook, not by matching "privilege" — the card section's
    // heading says Privilege too.
    const head = sheet.querySelector('.pass__label[data-section="privilege-benefits"]');
    const section = [];
    for (let n = head?.nextElementSibling; n && !n.classList.contains('pass__label'); n = n.nextElementSibling) section.push(n);
    const inSection = (sel) => section.flatMap((n) => [...n.querySelectorAll(sel)]);
    return {
      labels,
      state: document.querySelector('[data-pass]')?.dataset.state ?? '',
      partners: cards.length,
      benefits: sheet.querySelectorAll('.benefit').length,
      locked: sheet.querySelectorAll('.partner:not(.partner--network)[data-access="locked"]').length,
      available: sheet.querySelectorAll('.partner:not(.partner--network)[data-access="available"]').length,
      unavailable: sheet.querySelectorAll('.partner:not(.partner--network)[data-access="unavailable"]').length,
      lockWords: [...sheet.querySelectorAll('.partner__lock')].map((e) => e.textContent.trim()),
      buy: sheet.querySelectorAll('[data-product="privilege-card"]').length,
      lead: sheet.querySelector('[data-privilege-lead]')?.textContent.trim() ?? '',
      cardLabel: labels.find((l) => /privilege card/i.test(l)) ?? '',
      cardLine: sheet.querySelector('[data-card-state]')?.textContent.trim() ?? '',
      cardState: sheet.querySelector('[data-card-state]')?.dataset.cardState ?? '',
      cardAction: sheet.querySelector('[data-card]')?.innerText.trim() ?? '',
      cardActions: sheet.querySelectorAll('[data-card]').length,
      headlines: [...sheet.querySelectorAll('.benefit__headline')].map((e) => e.textContent.trim()),
      privilegeVenues: inSection('.partner').length,
      privilegeText: section.map((n) => n.innerText).join(' '),
      directions: inSection('.partner__directions').map((a) => a.getAttribute('href')),
      overflowing: cards.filter((c) => c.getBoundingClientRect().right > room.right + 1).length,
      clipped: [...sheet.querySelectorAll('.benefit__headline, .partner__lock')]
        .filter((e) => e.scrollWidth > e.clientWidth + 1).length,
      pageScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      text: sheet.innerText,
      sections: [...sheet.querySelectorAll('.pass__label')].map((e) => e.dataset.section ?? ''),
      privilegeSection: Boolean(head),
      plate: getComputedStyle(sheet.querySelector('[data-pass]'), '::before').backgroundImage.match(/[^/]+\.webp/)?.[0] ?? '',
      facts: [...sheet.querySelectorAll('.pass-facts__row')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()),
      /* The card face and its facts at this width: every line inside the card, and
         no fact cut off — the place a long state word or a room name would break. */
      faceFits: (() => {
        const card = sheet.querySelector('[data-pass]');
        if (!card) return false;
        const box = card.getBoundingClientRect();
        return [...card.querySelectorAll('p, span, img')].every((el) => {
          const r = el.getBoundingClientRect();
          return r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5 && r.left >= box.left - 0.5 && r.right <= box.right + 0.5;
        });
      })(),
      factsClipped: [...sheet.querySelectorAll('.pass-facts__row dt, .pass-facts__row dd')]
        .filter((e) => e.scrollWidth > e.clientWidth + 1).length,

      /* ── The network, as one list ──────────────────────────────────────── */
      network: (() => {
        const list = sheet.querySelector('.partners--network');
        if (!list) return null;
        const cards = [...list.querySelectorAll('.partner--network')];
        const room = (sheet.querySelector('.sheet__body') ?? sheet).getBoundingClientRect();
        const logos = [...list.querySelectorAll('.partner__logo img')];
        return {
          cards: cards.length,
          live: cards.filter((c) => c.dataset.status === 'active').length,
          soon: cards.filter((c) => c.dataset.status === 'activating').length,
          turns: list.querySelectorAll('[data-network-turn]').length,
          /* Index of the turn among the cards, to prove nothing straddles it. */
          beforeTurn: (() => {
            const turn = list.querySelector('[data-network-turn]');
            if (!turn) return -1;
            return cards.filter((c) => c.compareDocumentPosition(turn) & Node.DOCUMENT_POSITION_FOLLOWING).length;
          })(),
          names: cards.map((c) => c.querySelector('.partner__name')?.textContent.trim() ?? ''),
          directions: cards.map((c) => ({ id: c.dataset.partner,
            address: c.querySelector('.partner__meta')?.textContent.trim() ?? '',
            links: [...c.querySelectorAll('.partner__directions')].map((a) => a.getAttribute('href')) })),
          badges: list.querySelectorAll('.partner__soon').length,
          logos: logos.length,
          logosDecoded: logos.filter((i) => i.naturalWidth > 0).length,
          logosLocal: logos.every((i) => new URL(i.src).origin === location.origin),
          /**
           * A mark is contained, never cropped and never stretched.
           *
           * `object-fit: contain` letterboxes it, so the element fills the slot and
           * the painting keeps its own ratio inside. Checking the element's ratio
           * was the wrong test: it passed while a grid row overflowed its parent and
           * the bottom of the portrait lock-up was being cut off.
           */
          logoFit: logos.map((i) => {
            const r = i.getBoundingClientRect();
            const slot = i.parentElement.getBoundingClientRect();
            return {
              ok: getComputedStyle(i).objectFit === 'contain'
                && r.width <= slot.width + 0.5 && r.height <= slot.height + 0.5
                && i.naturalWidth > 0,
              drawn: `${Math.round(r.width)}x${Math.round(r.height)} in ${Math.round(slot.width)}x${Math.round(slot.height)}`,
            };
          }),
          overflowing: cards.filter((c) => c.getBoundingClientRect().right > room.right + 1).length,
          clipped: [...list.querySelectorAll('.partner__name, .partner__meta, .partner__kind, .partner__soon')]
            .filter((e) => e.scrollWidth > e.clientWidth + 1).length,
          text: list.innerText,
        };
      })(),
    };
  });
  return { probe, read };
}

/* ── A guest whose stay has not started ────────────────────────────────────
   The screen Irene actually had, at LunArt: checked before the upgrade and after
   it, because the reported bug was that the two looked the same. At Bella Vigna
   there is no upgrade to look the same as, and what is checked is that none is
   offered — no card section, no padlocked venue, no button to buy. */
{
  const { probe, read } = await passSheetAt(390, link);
  step('before arrival a standard Pass has no card section', read.cardActions===0 && !read.cardLabel,
    read.cardLabel || 'none');
  step('and no Privilege venue is offered as an upgrade, since none has an agreement',
    !read.privilegeSection && read.lockWords.length===0 && read.privilegeVenues===0,
    `${read.lockWords.length} marked, ${read.privilegeVenues} under Privilege`);
  step('with nothing to buy before arrival either', read.buy===0, `${read.buy} button(s)`);
  await probe.close();
}

{
  const { probe, read } = await passSheetAt(390);
  step('a guest in-house has an active Pass', read.state==='active', read.state);
  step('and still nothing is presented as claimable, with no agreement behind it',
    read.available===0 && read.locked===0 && read.benefits===0,
    `${read.available} available, ${read.locked} locked, ${read.benefits} benefits`);
  step('nothing is marked as an upgrade, and no line pitches Privilege',
    read.lockWords.length===0 && read.lead==='' && !/Disponibile con|si sbloccano con/.test(read.text),
    read.lockWords.join(' | ') || read.lead || 'none');
  step('and there is no way to buy it from the Pass', read.buy===0, `${read.buy} button(s)`);
  step('the facts come first, then the network, and nothing between them',
    read.sections.join(',')==='network' && read.facts.length===4, `${read.facts.join(' · ').slice(0, 80)} | ${read.sections.join(',')}`);
  step('Opera Caffè is never drawn as a benefit: it is in the network, being set up',
    read.privilegeVenues===0 && !/opera/i.test(read.privilegeText) && /Opera Caff/.test(read.network?.text ?? '')
      && /L’Opera Caffè[\s\S]{0,120}in attivazione/i.test(read.network?.text ?? ''),
    `${read.privilegeVenues} venues under Privilege`);
  /* One way there per venue: built from the address printed on the card, or the
     venue's own verified pin — never a second link, never a guessed place. */
  step('each venue has at most one set of directions, built from its own address',
    (() => {
      const cards = read.network?.directions ?? [];
      const built = (c) => c.links[0].startsWith('https://www.google.com/maps/dir/?api=1&destination=')
        && new URL(c.links[0]).searchParams.get('destination') === c.address;
      const pinned = (c) => /^https:\/\/(maps\.app\.goo\.gl|www\.google\.com\/maps)\//.test(c.links[0]);
      return cards.length > 0 && cards.every((c) => c.links.length <= 1)
        && cards.filter((c) => c.links.length === 1).every((c) => built(c) || pinned(c))
        && cards.some((c) => c.links.length === 1 && built(c));
    })(),
    `${(read.network?.directions ?? []).filter((c) => c.links.length).length} of ${(read.network?.directions ?? []).length} with directions`);
  await probe.screenshot({path:'tools/.qa-screens/pass-network-inhouse.png', fullPage:true});
  await probe.close();
}

/* ── The Pass sheet at every width a guest holds ───────────────────────────
   Four widths because the copy is real: "Via del Castello d'Altafronte 14R–16R,
   Firenze" is a long line on a 360px phone, and "Terrazza" and "Non ancora attiva"
   are longer than LunArt's room numbers. At LunArt this measured the benefit cards;
   at Bella Vigna there are none, so it measures that there are none at any width,
   that the card face holds every line, and that no fact is cut off. 820 is in
   because the Pass is already part of the tablet QA. */
for (const width of [360, 390, 430, 820]) {
  const { probe, read } = await passSheetAt(width);
  step(`at ${width}px the Pass sheet fits: face, facts, and no benefit card`,
    read.partners===0 && read.faceFits && read.factsClipped===0 && read.clipped===0 && !read.pageScroll,
    `${read.partners} benefit cards, face ${read.faceFits ? 'fits' : 'spills'}, ${read.factsClipped} facts clipped${read.pageScroll?', page scrolls sideways':''}`);
  // Whatever the artwork is, every card face has to be wearing the same one.
  step(`at ${width}px it wears the same artwork as the card on the home`, read.plate === STANDARD_PLATE && Boolean(STANDARD_PLATE),
    `${read.plate} vs ${STANDARD_PLATE}`);
  if (width===360 || width===820) {
    await probe.screenshot({path:`tools/.qa-screens/pass-partners-${width}.png`, fullPage:true});
  }
  /* The narrowest phone, with the in-house state and the longest room name: the
     legibility measurement below, on the card a guest is holding tonight. */
  if (width===360) await measureCard(probe, 'Pass, in-house at 360px');
  await probe.close();
}

/* ── The same stay, offered the upgrade ────────────────────────────────────
   At LunArt one reservation was walked through all three states — in-house without
   the upgrade, in-house with it, then called off. At Bella Vigna the middle state
   cannot be reached, and the check is that it cannot: the checkout behind the
   product sheet refuses the card for the reason that is true, and the Pass the
   guest already holds is unchanged by the attempt. */
async function buyPrivilege(guideLink, { startIndex = 0 } = {}) {
  const token = guideLink.split('/g/')[1];
  const ctxJson = await (await fetch(`${B}/api/guide/${token}`)).json();
  const option = ctxJson.cardOptions?.[0];
  const order = await post('/api/checkout', {
    guideToken: token,
    lang: 'it',
    customer: { name: 'QA Ospite', email: 'qa@example.invalid' },
    lines: [{
      productId: 'privilege-card',
      variantId: option?.variantId,
      quantity: 1,
      date: option?.startDates?.[startIndex] ?? option?.startDates?.[0],
      fields: { holderName: 'QA Ospite' },
    }],
  });
  if (!order.accessToken) return order;
  const session = new URL(order.checkoutUrl, B).searchParams.get('session');
  await post('/mock-checkout/pay', { session });
  // Opening the order is what settles it, exactly as a returning guest would.
  await fetch(`${B}/api/orders/${order.accessToken}`);
  return order;
}
/** Refused because no venue stands behind the card — not for a date, a price or a form. */
const refusedForNoPartner = (order) => !order.accessToken && !order.checkoutUrl
  && (order.errors ?? []).length > 0 && order.errors.every((e) => e.reason === 'no-card-partner');

{
  const order = await buyPrivilege(liveLink);
  step('Privilege cannot be bought on a stay that is already under way', refusedForNoPartner(order),
    `${order.error ?? 'accepted'} ${(order.errors ?? []).map((e) => e.reason ?? e.code).join(', ')}`);
  const guide = await (await fetch(`${B}/api/guide/${liveLink.split('/g/')[1]}`)).json();
  step('and the server still holds the standard Pass, with no card and no entitlement',
    guide.pass?.tier==='pass' && guide.pass?.card===null && (guide.pass?.entitlements ?? []).length===0,
    `${guide.pass?.tier}, card ${JSON.stringify(guide.pass?.card)}, ${(guide.pass?.entitlements ?? []).join(',') || 'no entitlements'}`);
  const { probe, read } = await passSheetAt(390);
  step('so the sheet after the attempt is the sheet before it',
    read.state==='active' && read.cardActions===0 && !read.cardLabel && read.available===0 && read.buy===0,
    `${read.state} · ${read.cardActions} card action(s) · ${read.available} available`);
  await probe.screenshot({path:'tools/.qa-screens/pass-privilege-refused.png', fullPage:true});
  await probe.close();
}

/* ── The network, as a guest scrolls it ────────────────────────────────────
   Thirty-two businesses in one list. At LunArt: three with an agreement, one rule,
   then the twenty-nine being set up. At Bella Vigna the three agreements are
   LunArt's and not yet confirmed for this house, so all thirty-two sit after the
   one turn, each saying it is being set up. The checks are about the list staying
   one list, the marks staying undistorted, and nothing down there reading as an
   offer. */
{
  const { probe, read } = await passSheetAt(390);
  const n = read.network;
  step('the whole network is one list in the Pass', Boolean(n) && n.cards === 32,
    n ? `${n.cards} cards` : '(no network list)');
  step('with no agreement confirmed for Bella Vigna, every one of them after the one turn',
    n?.live === 0 && n?.soon === 32 && n?.turns === 1 && n?.beforeTurn === 0,
    `${n?.live} live, ${n?.soon} being set up, ${n?.turns} turn(s) after ${n?.beforeTurn}`);
  step('in the order LunArt curated them, the three LunArt agreements still first',
    n?.names.slice(0, 5).join(' · ') === 'L’Opera Caffè · Le Firme · Blue Velvet · Babylon Club · La Petite'
      && n?.names.at(-1) === 'Sartoria Rossi',
    `${n?.names.slice(0, 4).join(' · ')} … ${n?.names.at(-1)}`);
  step('each one being set up says so, once', n?.badges === 32, `${n?.badges} badge(s)`);
  step('and nothing down there is a padlock, a price or a way to buy',
    !/In attivazione.*(sconto|€|%|Acquista|Mostra la card)/s.test(n?.text ?? '')
      && !/\d+\s*%/.test(n?.text ?? ''),
    'no invented terms');

  step('the official marks load, from this origin, undistorted',
    n?.logos === 2 && n?.logosDecoded === 2 && n?.logosLocal === true
      && n?.logoFit.every((f) => f.ok),
    `${n?.logosDecoded}/${n?.logos} drawn at ${n?.logoFit.map((f) => f.drawn).join(', ')}`);
  step('and never instead of the name: both are written out',
    (n?.text ?? '').includes('L’Opera Caffè') && (n?.text ?? '').includes('Blue Velvet')
      && (n?.text ?? '').includes('Le Firme'),
    'logo and name, not logo or name');
  step('a business with no agreement has no internal note on its card',
    !/Mirko|Massimiliano|Mary|Mauro|Jacopo|confermare|confirm|attivo per LunArt|accordo LunArt/i.test(n?.text ?? ''),
    'contacts, uncertainty and LunArt\u2019s own agreements stay off the screen');

  await probe.screenshot({ path: 'tools/.qa-screens/pass-network.png', fullPage: true });
  await probe.close();
}

for (const width of [360, 390, 430, 820]) {
  const { probe, read } = await passSheetAt(width);
  const n = read.network;
  step(`at ${width}px the network cards fit, nothing clipped, logos in proportion`,
    n?.overflowing === 0 && n?.clipped === 0 && !read.pageScroll && n?.logoFit.every((f) => f.ok),
    `${n?.overflowing} overflowing, ${n?.clipped} clipped, logos ${n?.logoFit.map((f) => f.drawn).join(' ')}`);
  if (width === 360) await probe.screenshot({ path: 'tools/.qa-screens/pass-network-360.png', fullPage: true });
  await probe.close();
}

/* ── A stay longer than any card ───────────────────────────────────────────
   At LunArt: six nights, two Privilege days starting the day after tomorrow, and
   the guide had to say the card had not started while the stay had. The hole that
   matters at Bella Vigna is the other way round — whether some length and start
   day slips past the rule — so each length this stay offers is tried on its first
   and its last possible day, and every one is refused for the same reason. */
{
  const longStay = await post('/api/staff/reservations', {
    first_name: 'Long', last_name: `L${Date.now().toString(36).slice(-4)}`,
    guest_email: 'l@example.invalid', check_in: inDays(0), check_out: inDays(6),
    room: 'Standard', adults: 2, booking_reference: `LONG-${Date.now()}`,
  });
  const longLink = (await post(`/api/staff/reservations/${longStay.reservation.id}/link`)).link;
  const longToken = longLink.split('/g/')[1];
  const options = (await (await fetch(`${B}/api/guide/${longToken}`)).json()).cardOptions ?? [];
  const attempts = [];
  for (const option of options) {
    for (const date of new Set([option.startDates?.[0], option.startDates?.at(-1)].filter(Boolean))) {
      attempts.push(await post('/api/checkout', {
        guideToken: longToken, lang: 'it',
        customer: { name: 'QA Ospite', email: 'qa@example.invalid' },
        lines: [{ productId: 'privilege-card', variantId: option.variantId, quantity: 1, date, fields: { holderName: 'QA Ospite' } }],
      }));
    }
  }
  step('no card length on any start day of a six-night stay gets past the rule',
    options.length > 1 && attempts.length > 1 && attempts.every(refusedForNoPartner),
    `${options.map((o) => o.variantId).join(', ')}: ${attempts.filter(refusedForNoPartner).length}/${attempts.length} refused for no-card-partner`);

  const guide = await (await fetch(`${B}/api/guide/${longToken}`)).json();
  step('the stay is live with no card behind it, so there is no code to issue',
    guide.pass?.state==='active' && guide.pass?.card===null, `pass ${guide.pass?.state}, card ${JSON.stringify(guide.pass?.card)}`);
  const { probe, read } = await passSheetAt(390, longLink);
  step('and the sheet says nothing about a card that does not exist',
    read.state==='active' && read.cardActions===0 && read.cardState==='' && read.lead==='' && !/Privilege Card/i.test(read.text),
    `${read.cardActions} card action(s), state "${read.cardState}"`);

  await probe.close();
  await post(`/api/staff/reservations/${longStay.reservation.id}/cancel`, { reason: 'QA' });
}

/* ── A Pass that is over, or was called off ────────────────────────────────
   Nothing on this screen may read as usable, and a cancelled booking is not a
   sales opportunity. At LunArt this was checked on an upgraded Pass, the harder
   case; at Bella Vigna it is the Pass the guest can actually hold, and what is
   checked is that the card and its facts say the booking is cancelled. */
await post(`/api/staff/reservations/${today.reservation.id}/cancel`,{reason:'QA'});
{
  const { probe, read } = await passSheetAt(390);
  step('a cancelled booking says so on the card and in its facts',
    read.state==='cancelled' && read.facts.some((f) => /Prenotazione annullata/.test(f)),
    `${read.state} · ${read.facts.at(-1)}`);
  step('and nothing on it reads as usable',
    read.available===0 && read.locked===0 && read.benefits===0,
    `${read.available} available, ${read.locked} locked, ${read.benefits} benefits`);
  step('and it is not treated as a sales opportunity', read.buy===0, `${read.buy} button(s)`);
  await probe.screenshot({path:'tools/.qa-screens/pass-partners-cancelled.png', fullPage:true});
  await probe.close();
}
console.log('');

/* ── The type has to survive the artwork ───────────────────────────────────
   Text over a photograph cannot be checked from CSS colours: the backdrop is
   pixels, and it is pixels produced by four stacked gradients over a plate. So this
   does not model the scrim — modelling it would only test the model. It hides the
   type, photographs the card as the browser actually painted it, and measures each
   line against the *lightest* pixel inside its own box: the worst case, which is
   the one a guest reads a letter against.

   It caught the brand mark at 1.1:1 over bright sky, and the status line being
   pushed past the bottom edge of the card. */
/**
 * Measure every line on the card against the pixels actually behind it.
 *
 * A function rather than a block because it has to run more than once: at LunArt
 * the Privilege plate is gold, and the tier chip only exists there — which is
 * exactly where a gold-on-gold chip went unmeasured and came out invisible. At Bella
 * Vigna neither the Privilege face nor the venue card can be reached until a venue
 * is confirmed, so it runs on the Pass a guest can hold: before arrival at 390px,
 * and in-house on the narrowest phone.
 */
async function measureCard(target, tier, selector = '.sheet [data-pass]') {
  const colours = await target.evaluate((sel) => {
    const root = document.querySelector(sel);
    const box = root.getBoundingClientRect();
    return ['.pass__holder', '.pass__line', '.pass__state', '.pass__tier',
      '.privilege-card__holder', '.privilege-card__guests', '.privilege-card__dates',
      '.privilege-card__number', '.privilege-card__kind']
      .map((sel) => {
        const el = root.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        // An element with its own opaque fill is read against that fill, not against
        // the plate behind it — the tier chip is a filled badge, and measuring its
        // text against the artwork it covers would be measuring the wrong thing.
        const fill = /rgba?\(([^)]+)\)/.exec(style.backgroundColor)?.[1].split(',').map(Number) ?? [];
        const opaque = fill.length >= 3 && (fill[3] === undefined || fill[3] >= 0.95);
        return {
          sel,
          color: style.color,
          own: opaque ? fill.slice(0, 3) : null,
          // Relative to the card, because that is what gets photographed.
          x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height,
        };
      }).filter(Boolean);
  }, selector);

  const hidden = await target.addStyleTag({
    content: `${selector} .pass__face *, ${selector} > * { visibility: hidden !important; }`,
  });
  await target.waitForTimeout(250);
  const shot = (await target.locator(selector).screenshot()).toString('base64');
  await target.evaluate((el) => el.remove(), hidden);

  const results = await target.evaluate(async ({ png, lines, sel }) => {
    const srgb = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
    const parse = (css) => css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

    const bytes = Uint8Array.from(atob(png), (ch) => ch.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx2 = canvas.getContext('2d', { willReadFrequently: true });
    ctx2.drawImage(bitmap, 0, 0);

    // The screenshot is in device pixels; the rects were measured in CSS pixels.
    const scale = bitmap.width / document.querySelector(sel).getBoundingClientRect().width;

    return lines.map(({ sel, color, own, x, y, w, h }) => {
      if (own) {
        const [hi, lo] = [lum(parse(color)), lum(own)].sort((a, b) => b - a);
        return { sel, ratio: +((hi + 0.05) / (lo + 0.05)).toFixed(2), backdrop: own, onOwnFill: true };
      }
      const px = ctx2.getImageData(
        Math.max(0, Math.round(x * scale)), Math.max(0, Math.round(y * scale)),
        Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)),
      ).data;

      /**
       * The worst pixel, whichever direction the type runs.
       *
       * This used to take the lightest pixel, which is the worst case only for light
       * type on a dark ground. The Pass is now dark ink on a pale watercolour, where
       * the dangerous pixel is the darkest one — the Duomo's cupola, a cypress. So
       * the contrast is computed against every pixel and the lowest answer kept,
       * which is correct for either and needs no flag saying which this is.
       */
      const ink = lum(parse(color));
      let worst = Infinity; let backdrop = [0, 0, 0];
      for (let i = 0; i < px.length; i += 4) {
        const rgb = [px[i], px[i + 1], px[i + 2]];
        const [hi, lo] = [ink, lum(rgb)].sort((a, b) => b - a);
        const ratio = (hi + 0.05) / (lo + 0.05);
        if (ratio < worst) { worst = ratio; backdrop = rgb; }
      }
      return { sel, ratio: +worst.toFixed(2), backdrop };
    });
  }, { png: shot, lines: colours, sel: selector });

  for (const { sel, ratio, backdrop, onOwnFill } of results) {
    // The holder's name is large type, which AA puts at 3:1; everything else is 4.5:1.
    const need = sel === '.pass__holder' ? 3 : 4.5;
    step(`${tier}: ${sel.replace('.pass__','')} reads over ${onOwnFill ? 'its own fill' : 'the artwork'}`,
      ratio >= need, `${ratio}:1 (needs ${need}) over rgb(${backdrop.join(',')})`);
  }

  /* And it has to fit: the status line used to be pushed past the card's bottom edge
     by a `margin-top: auto` layout on a box with a fixed aspect ratio. */
  const fits = await target.evaluate((sel) => {
    const box = document.querySelector(sel).getBoundingClientRect();
    return [...document.querySelectorAll(`${sel} p, ${sel} span`)]
      .every((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5;
      });
  }, selector);
  step(`${tier}: every line of it is inside the card`, fits);
}

/* ── The type has to survive the artwork ───────────────────────────────────
   Text over a photograph cannot be checked from CSS colours: the backdrop is
   pixels, and it is pixels produced by four stacked gradients over a plate. So this
   does not model the scrim — modelling it would only test the model. It hides the
   type, photographs the card as the browser actually painted it, and measures each
   line against the *lightest* pixel inside its own box: the worst case, which is the
   one a guest reads a letter against.

   It caught the brand mark at 1.1:1 over bright sky, the status line being pushed
   past the bottom edge of the card, the Privilege chip at gold-on-gold, and — once
   the card became dark ink on the voucher's pale watercolour — the fact that the
   worst pixel is now the darkest one rather than the lightest. */
await measureCard(page, 'Pass');

/* Back out, so the screens that follow start from the home. */
await page.goBack(); await page.waitForTimeout(700);

/* ── A checkout that was started and abandoned ─────────────────────────────
   On staging these had piled up and were crowding out the order that is actually
   coming. They are kept — a guest who thinks they paid must be able to find out
   that they did not — but they are not purchases and must not read as any. */
const guideToken = link.split('/g/')[1];
const started = await (await fetch(`${B}/api/checkout`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    lines: [{ productId: 'light-breakfast', quantity: 1, date: inDays(31), slotId: 'b-0900', room: ROOM }],
    customer: { name: 'QA', email: 'qa@example.com', room: ROOM },
    lang: 'it',
    guideToken,
  }),
})).json();
// Deliberately never paid: that is the whole point of this case.

await page.goto(link, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const split = await page.evaluate(() => ({
  main: document.querySelectorAll('.purchases:not(.purchases--muted) .purchase').length,
  mainText: [...document.querySelectorAll('.purchases:not(.purchases--muted) .purchase')].map((e) => e.innerText).join(' '),
  aside: document.querySelectorAll('.purchases-aside').length,
  asideOpen: document.querySelector('.purchases-aside')?.open ?? null,
  asideRows: document.querySelectorAll('.purchases--muted .purchase').length,
  asideLabel: document.querySelector('.purchases-aside__summary')?.innerText.replace(/\s+/g,' ').trim() ?? '',
}));
step('an abandoned checkout is kept, not deleted', split.aside===1 && split.asideRows>0, `${split.asideRows} row(s)`);
step('but it is folded away rather than leading the list', split.asideOpen===false);
step('and it is named for what it is', /non completati|not completed/i.test(split.asideLabel), split.asideLabel);
step('what was actually paid for leads', split.main>0 && !/in attesa di pagamento|waiting for payment/i.test(split.mainText), `${split.main} purchase(s)`);
step('the abandoned order is still reachable', Boolean(started.accessToken));
await page.screenshot({path:'tools/.qa-screens/pass-purchases-split.png'});

// The decisive one: a brand new browser, nothing remembered.
const fresh = await b.newContext({...devices['iPhone 13'],locale:'it-IT'});
const page2 = await fresh.newPage();
await page2.goto(link,{waitUntil:'networkidle'}); await page2.waitForTimeout(2500);
const cold = await page2.evaluate((k)=>({
  purchases: document.querySelectorAll('.purchase').length,
  stored: JSON.parse(localStorage.getItem(k)||'[]').length,
}), KEYS.orders);
step('a brand-new browser still finds the purchase', cold.purchases>0, `${cold.purchases} shown, ${cold.stored} remembered locally`);
await page2.screenshot({path:'tools/.qa-screens/flow-purchases.png'});
step('no page errors', errs.length===0, errs.slice(0,2).join(' | '));

/* The same page in English, because a card and a receipt are exactly the kind of
   screen that gets translated once and then forgotten. */
const en = await b.newContext({...devices['iPhone 13'],locale:'en-GB'});
const page3 = await en.newPage();
await page3.goto(link,{waitUntil:'networkidle'}); await page3.waitForTimeout(2500);
for (let i=0;i<2 && (await page3.getAttribute('html','lang'))!=='en';i++){ await page3.click('#lang-toggle'); await page3.waitForTimeout(500); }
await page3.waitForTimeout(1200);
const english = await page3.evaluate(()=>({
  lang: document.documentElement.lang,
  pass: document.querySelector('[data-pass]')?.innerText ?? '',
  heading: [...document.querySelectorAll('#main h2')].map(e=>e.textContent.trim()),
  purchases: document.querySelector('.purchases')?.innerText ?? '',
  overflow: document.documentElement.scrollWidth - window.innerWidth,
}));
step('the Pass renders in English too', english.lang==='en' && english.pass.length>0);
step('with an English heading', english.heading.some(h=>/Pass|Privilege/i.test(h)), english.heading.filter(h=>/Pass|Privilege/i.test(h)).join(', '));
step('and the purchase reads in English', /Confirmed|Paid|Waiting/i.test(english.purchases), english.purchases.replace(/\s+/g,' ').slice(0,60));
step('no horizontal overflow at 390px', english.overflow<=1, String(english.overflow));
await page3.screenshot({path:'tools/.qa-screens/flow-purchases-en.png'});

/* ── The three offers move with the moment, and nothing disappears ─────────
   Checked through real reservations rather than through the ranking module,
   because the question is what a guest is shown, not what a function returns. */
console.log('');
const moments = [
  { label: 'before arriving', from: inDays(14), to: inDays(16), lead: /transfer|ncc/i },
  { label: 'arrival day',     from: inDays(0),  to: inDays(2),  lead: /vino|wine/i },
  { label: 'mid-stay',        from: inDays(-1), to: inDays(2),  lead: /vino|wine/i },
  { label: 'leaving today',   from: inDays(-2), to: inDays(0),  lead: /bagagl|luggage/i },
];
const spent = [];
for (const m of moments) {
  const r = await post('/api/staff/reservations',{first_name:'Rank',last_name:`R${Math.random().toString(36).slice(2,6)}`,guest_email:'r@example.invalid',check_in:m.from,check_out:m.to,room:ROOM,adults:2,booking_reference:`RANK-${Date.now()}-${m.label.length}`});
  spent.push(r.reservation.id);
  const { link: l } = await post(`/api/staff/reservations/${r.reservation.id}/link`);
  const c = await b.newContext({...devices['iPhone 13'],locale:'it-IT'});
  const pg = await c.newPage();
  await pg.goto(l,{waitUntil:'networkidle'}); await pg.waitForTimeout(1800);
  const seen = await pg.evaluate(()=>({
    offers: [...document.querySelectorAll('.offer__title')].map(e=>e.textContent.trim()),
    cta: !!document.querySelector('[data-shop]'),
  }));
  step(`${m.label}: three offers, led by the right one`, seen.offers.length===3 && m.lead.test(seen.offers[0]), seen.offers.join(' · '));
  step(`${m.label}: the whole catalogue is still one tap away`, seen.cta);
  // And the shop itself is never thinned by the moment.
  await pg.goto(`${l}#/shop`,{waitUntil:'networkidle'}); await pg.waitForTimeout(1200);
  const inShop = await pg.locator('#main .card').count();
  step(`${m.label}: the shop lists everything regardless`, inShop >= 8, `${inShop} products`);
  await c.close();
}

/* A one-night stay must not lose access to anything. */
const oneNight = await post('/api/staff/reservations',{first_name:'Breve',last_name:`B${Math.random().toString(36).slice(2,6)}`,guest_email:'b@example.invalid',check_in:inDays(0),check_out:inDays(1),room:ROOM,adults:2,booking_reference:`ONE-${Date.now()}`});
spent.push(oneNight.reservation.id);
const { link: shortLink } = await post(`/api/staff/reservations/${oneNight.reservation.id}/link`);
const c1 = await b.newContext({...devices['iPhone 13'],locale:'it-IT'});
const p1 = await c1.newPage();
await p1.goto(`${shortLink}#/shop`,{waitUntil:'networkidle'}); await p1.waitForTimeout(1500);
const shortShop = await p1.locator('#main .card').count();
step('a one-night stay reaches the whole catalogue', shortShop >= 8, `${shortShop} products`);
await p1.goto(shortLink,{waitUntil:'networkidle'}); await p1.waitForTimeout(1800);
step('and still gets three offers and a Pass',
  (await p1.locator('.offer').count())===3 && await p1.locator('[data-pass]').isVisible());
await c1.close();

/* ── Privilege, withheld ───────────────────────────────────────────────────
   At LunArt this bought the upgrade on this link and walked what changed: the same
   card turning gold, the rows under it dimming while the card had not started, the
   card's own section in the Pass, the venue card with its sealed preview QR, and
   the legibility of the gold plate and of the venue card. None of it can exist at
   Bella Vigna yet, and the unit tests carry those mechanics against a property
   fixture (test/pass.test.mjs, test/privilege-card.test.mjs, test/card.test.mjs,
   test/card-qr-slot.test.mjs). What only this file can see is that the withholding
   is whole: the catalogue, the checkout and every screen agree that there is
   nothing to buy and nothing to claim — and the day a venue is confirmed, the first
   check below fails and says to walk the upgrade here again. */
console.log('');
const catalog = await (await fetch(`${B}/api/catalog`)).json();
const cardProduct = catalog.products.find((p) => p.id === 'privilege-card');
// `purchasable` is the catalogue's own answer, and it already carries the rule
// that matters: no card partner, no Privilege on sale.
step('Privilege is not on sale, because no venue has confirmed an agreement for Bella Vigna',
  Boolean(cardProduct) && cardProduct.purchasable === false,
  `catalogue says purchasable=${cardProduct?.purchasable}`);
step('the catalogue publishes no claimable benefit, with the stay or with the card',
  (catalog.stayBenefits ?? []).length === 0 && (catalog.cardBenefits ?? []).length === 0,
  `${(catalog.stayBenefits ?? []).length} stay, ${(catalog.cardBenefits ?? []).length} card`);
step('and every venue in it as being set up, with no benefit attached',
  catalog.partners.length === 32
    && catalog.partners.every((p) => p.partnership_status === 'activating' && (p.benefits ?? []).length === 0),
  `${catalog.partners.filter((p) => p.partnership_status === 'activating').length}/${catalog.partners.length} activating`);

{
  const upgrade = await buyPrivilege(link);
  step('the upgrade cannot be bought from the personal link either', refusedForNoPartner(upgrade),
    `${upgrade.error ?? 'accepted'} ${(upgrade.errors ?? []).map((e) => e.reason ?? e.code).join(', ')}`);

  const upgradeCtx = await b.newContext({ ...devices['iPhone 13'], locale: 'it-IT' });
  const up = await upgradeCtx.newPage();
  /** Every call for a card: there is none to ask about, so there should be none. */
  const cardCalls = [];
  up.on('request', (r) => { if (r.url().includes('/api/card/')) cardCalls.push(r.url()); });
  await up.goto(link, { waitUntil: 'networkidle' });
  await up.waitForTimeout(2500);
  const after = await up.evaluate(() => ({
    tier: document.querySelector('[data-pass]')?.className ?? '',
    heading: [...document.querySelectorAll('#main h2')].map((e) => e.textContent.trim()).join(' | '),
    passes: document.querySelectorAll('[data-pass]').length,
    chip: document.querySelector('.pass__tier')?.textContent.trim() ?? '',
    section: document.querySelector('[data-pass-block]')?.innerText ?? '',
    rows: document.querySelectorAll('[data-pass-block] .pass__benefit').length,
    offers: [...document.querySelectorAll('.offer__title')].map((e) => e.textContent.trim()),
  }));
  step('the Pass stays the Pass: the standard tier, one card, no Privilege chip',
    !/privilege/.test(after.tier) && after.passes === 1 && after.chip === '',
    `${after.tier.trim()} · ${after.passes} card(s) · chip "${after.chip}"`);
  step('the heading says Pass, not Privilege', /Bella Vigna Pass/.test(after.heading) && !/privilege/i.test(after.heading),
    after.heading.split(' | ').find((h) => /Pass/.test(h)) ?? after.heading);
  step('the home lists no benefit row under the card and says nothing of owning Privilege',
    after.rows === 0 && !/privilege|Hai già/i.test(after.section),
    (after.section.split('\n').filter(Boolean).at(-1) ?? '').slice(0, 80));
  step('and Privilege is not one of the offers the home leads with',
    after.offers.length === 3 && !after.offers.some((o) => /privilege/i.test(o)), after.offers.join(' · '));
  step('nothing asks the server for a card', cardCalls.length === 0, cardCalls.slice(0, 2).join(', ') || 'no calls');
  await up.screenshot({ path: 'tools/.qa-screens/pass-privilege-withheld.png' });
  await upgradeCtx.close();
}

// Tidy up after ourselves.
for (const id of spent) await post(`/api/staff/reservations/${id}/cancel`,{reason:'QA'});
await post(`/api/staff/reservations/${made.reservation.id}/cancel`,{reason:'QA'});

await b.close();
console.log(failures===0 ? '\nALL PASS/COMMERCE CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures===0?0:1);
