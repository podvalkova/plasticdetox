// The screens. Each one is a pure render into a container, given already
// resolved data, so nothing here waits on a network call or knows about the
// camera. Navigation is handled by main.js.

import { FRONTS, STANCE_LABEL, verdictFor, alternativesFor, ratedProducts } from "./match.js";
import { packagingHeadline } from "./upc.js";
import { el, frag, icon, ICONS, splitNote } from "./ui.js";
import { buyLink, productImage, tipOfDay, allArticles } from "./data.js";
import { stepContent, roomName } from "./detox-content.js";

const SITE = "https://plasticdetox.org";
const STATUS_GLYPH = { pass: "✓", caution: "!", fail: "✕", unknown: "?" };

// ------------------------------------------------------------------- home

export function home(root, {
  onScan, onSearch, onPick, onStarter, onAllCategories,
  onCheck, onProduct, recents, starters, canScan, scanReason,
  categoryCount, draft,
}) {
  const hero = el("div", "hero");
  hero.appendChild(el("h1", null, "Check it before you buy it"));
  hero.appendChild(el("p", null,
    "Four checks on every product: what is in it, what it is made of, what it has "
    + "been recalled or sued over, and what independent labs found. Nothing earns a "
    + "recommendation until all four are done."));
  root.appendChild(hero);

  // The scan card, which the canvas makes the hero: it is the fastest way to
  // an answer and it used to sit under the form as an afterthought.
  const scanCard = el("button", `scan-card${canScan ? "" : " off"}`);
  scanCard.type = "button";
  const glyph = el("div", "scan-glyph");
  for (const w of [2, 4, 2]) {
    const bar = el("i");
    bar.style.width = `${w}px`;
    glyph.appendChild(bar);
  }
  scanCard.appendChild(glyph);
  const scanText = el("div", "scan-text");
  scanText.appendChild(el("div", "scan-h", canScan ? "Scan a barcode" : "Scanning unavailable"));
  scanText.appendChild(el("div", "scan-p", canScan ? "or search by name below" : (scanReason || "Search by name below")));
  scanCard.appendChild(scanText);
  scanCard.onclick = canScan ? onScan : null;
  scanCard.disabled = !canScan;
  root.appendChild(scanCard);

  // Brand and product are separate fields, as they are on the site. A single
  // box invited a brand name on its own, and a brand verdict is the least
  // useful answer we hold: half our product verdicts disagree with it.
  const form = el("form", "check-form");
  form.setAttribute("novalidate", "");

  const brand = field("For example Pampers", (draft && draft.brand) || "", "Brand");
  const product = field("For example Sensitive Wipes", (draft && draft.product) || "", "Product");
  form.appendChild(brand.wrap);

  // Type ahead on the brand only. A brand we already hold should never need
  // the second field filled in to be found.
  //
  // Tapping a suggestion used to jump straight to a verdict, which skipped the
  // product field entirely: you could name the brand and never get asked what
  // you were holding. A brand suggestion now fills the field and moves you on.
  // A suggestion that names a product still goes, because at that point you
  // have said which one.
  //
  // Five, not twenty. The list sits between the two fields, so a long one
  // pushed the product field off the screen, which is the other half of why
  // there appeared to be nowhere to type it.
  const results = el("div", "results");
  brand.input.oninput = () => onSearch(brand.input.value, results, () => ({
    brand: brand.input.value, product: product.input.value,
  }), (hit) => {
    if (hit.product || hit.scan) return false;
    brand.input.value = hit.brand.brand;
    results.replaceChildren();
    showProducts(hit.brand);
    return true;
  }, 5);
  form.appendChild(results);

  // Which one of theirs is it?
  //
  // Typing the product was a guessing game against our own match rules. A+D
  // has one product, "Original diaper rash ointment", and typing "ointment"
  // matched nothing, because a matchAll group needs every word in it. The
  // person then got "no verdict" on a product we hold a full scorecard for.
  //
  // So stop asking them to guess. Once the brand is known, list what we have
  // and let them point at it, with a way out for anything we do not list.
  const picker = el("div", "picker");
  form.appendChild(picker);

  function showProducts(b) {
    picker.replaceChildren();
    const rows = ratedProducts(b);
    if (!rows.length) {
      product.wrap.hidden = false;
      product.input.focus();
      product.wrap.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    product.wrap.hidden = true;
    picker.appendChild(el("div", "section-title", `Which ${b.brand}?`));
    for (const { row: pr, stance } of rows) {
      const line = el("button", "row");
      line.type = "button";
      line.appendChild(el("span", `dot ${stance || "neutral"}`));
      const body = el("div", "row-body");
      body.appendChild(el("div", "row-name", pr.name));
      const hint1 = scopeHint(pr);
      if (hint1 || pr.cat) body.appendChild(el("div", "row-sub", hint1 || pr.cat));
      line.appendChild(body);
      line.appendChild(el("span", "row-chev", "\u203a"));
      line.onclick = () => onProduct(b, pr);
      picker.appendChild(line);
    }
    const other = el("button", "row");
    other.type = "button";
    other.appendChild(el("span", "dot neutral"));
    const ob = el("div", "row-body");
    ob.appendChild(el("div", "row-name", "Something else"));
    ob.appendChild(el("div", "row-sub", "Type the product name"));
    other.appendChild(ob);
    other.appendChild(el("span", "row-chev", "\u203a"));
    other.onclick = () => {
      picker.replaceChildren();
      product.wrap.hidden = false;
      product.input.focus();
      product.wrap.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    picker.appendChild(other);
    picker.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  form.appendChild(product.wrap);

  const go = el("button", "cta outline", "Check it");
  go.type = "submit";
  form.appendChild(go);
  form.onsubmit = (e) => {
    e.preventDefault();
    onCheck({ brand: brand.input.value.trim(), product: product.input.value.trim() });
  };
  root.appendChild(form);


  if (!canScan) root.appendChild(el("p", "scan-why", noCameraReason(scanReason)));

  // History as a strip, not a list. Stacked down the screen it pushed browsing
  // off the bottom, so after a shop's worth of checking the first thing the app
  // showed was a list of things already looked at.
  if (recents && recents.length) {
    root.appendChild(el("div", "section-title", "Recently checked"));
    const strip = el("div", "strip");
    for (const r of recents) strip.appendChild(recentChip(r, onPick));
    root.appendChild(strip);
  }

  // The Browse list used to live here. It is what the Shop tab is, and having
  // both meant the home screen answered a question the bar already answers.
  // Check is for something in your hand; Shop is for everything else.

  root.appendChild(el("p", "note",
    "A verdict here is the same one the site publishes. We rate a product only when we have researched that exact product."));
}

/** One labelled input in the check form. */
function field(placeholder, value, label) {
  const wrap = el("div", "field");
  if (label) wrap.appendChild(el("div", "field-k", label));
  const input = el("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.value = value || "";
  input.autocapitalize = "words";
  input.autocomplete = "off";
  input.spellcheck = false;
  wrap.appendChild(input);
  return { wrap, input };
}

/** One thing you already checked, small enough that twenty of them fit. */
function recentChip(r, onPick) {
  const chip = el("button", "chip");
  chip.type = "button";
  chip.appendChild(el("span", `dot ${r.stance || "neutral"}`));
  chip.appendChild(el("span", "chip-name", r.name));
  chip.onclick = () => onPick(r);
  return chip;
}

/**
 * Why the camera is not available, told apart rather than lumped together.
 *
 * "No scanner in this build" and "no camera on this device" look identical to
 * someone holding a phone, and only the first is a bug.
 */
function noCameraReason(reason) {
  if (reason === "missing-plugin") {
    return "The scanner is missing from this build. That is a bug, not your phone. Please report it.";
  }
  if (reason === "no-camera") {
    return "No camera on this device. On a real iPhone this opens the scanner.";
  }
  return "Scanning in a browser needs Chrome. Everything else here works, and on the iPhone the scanner opens the camera.";
}

export function renderResults(container, hits, onPick) {
  container.replaceChildren();
  if (!hits.length) return;
  container.appendChild(el("div", "section-title", `${hits.length} match${hits.length === 1 ? "" : "es"}`));
  for (const hit of hits) {
    const row = el("button", "row");
    row.appendChild(el("span", `dot ${hit.brand.stance || "neutral"}`));
    const body = el("div", "row-body");
    body.appendChild(el("div", "row-name", hit.brand.brand));
    body.appendChild(el("div", "row-sub",
      hit.product ? `${hit.product.name} · ${hit.brand.category}` : hit.brand.category));
    row.appendChild(body);
    row.appendChild(el("span", "row-chev", "›"));
    row.onclick = () => onPick(hit);
    container.appendChild(row);
  }
}


/**
 * The tab bar. Two jobs, so two tabs, and no more.
 */
export function tabs(current, onTab) {
  const bar = el("div", "tabs");
  for (const [key, label, path] of [
    ["detox", "Detox", ICONS.detox],
    ["check", "Check", ICONS.check],
    ["shop", "Shop", ICONS.shop],
    ["saved", "Saved", ICONS.saved],
    ["learn", "Learn", ICONS.learn],
  ]) {
    // The canvas drops the icons: five text pills, the current one filled.
    // At this size the glyphs were decoration that cost the label its room.
    const b = el("button", `tab${current === key ? " on" : ""}`);
    b.appendChild(el("span", null, label));
    b.onclick = () => onTab(key);
    bar.appendChild(b);
  }
  return bar;
}

// ------------------------------------------------------------------ detox

/**
 * Your home, item by item.
 *
 * The same 23 swaps the plan publishes, but the screen is a picture rather
 * than a list: sources you have cleared are tiles with a check, one tile
 * glows next, and everything further ahead hides behind quiet tiles until
 * you get there. One bar tracks the whole journey and shifts color as you
 * move through it. Counts, never percentages: "3 gone, 20 to go" is language
 * anyone feels.
 */
/**
 * Tell us we got it wrong.
 *
 * The verdicts are researched by hand and some of them will be out of date or
 * simply mistaken, and the person holding the product is the one who can see
 * it first. This carries their note plus the context we would otherwise have
 * to ask for: which row, what we currently say, and what the four checks read.
 *
 * mailto rather than a form, so it cannot fail silently on a bad connection
 * and they keep a copy in their sent mail.
 */
function reportCard(v, onOpen) {
  const wrap = el("div", "report");
  const open = el("button", "report-open", "Something wrong here? Tell us");
  const form = el("div", "report-form");
  form.hidden = true;
  const ta = el("textarea");
  ta.placeholder = "What did we get wrong?";
  ta.rows = 3;
  form.appendChild(ta);
  const send = el("button", "cta ghost", "Send to our inbox");
  send.onclick = () => {
    const said = ta.value.trim();
    if (!said) { ta.focus(); return; }
    const name = v.product ? `${v.brand.brand} ${v.product.name}` : v.brand.brand;
    const fr = v.fronts || {};
    const scorecard = ["formula", "materials", "legal", "testing"]
      .map((k) => `${k}: ${(fr[k] || {}).status || "unknown"}`).join(", ");
    const body = [
      said, "", "---", `Product: ${name}`,
      `Our verdict: ${STANCE_LABEL[v.stance] || v.stance || "none"}`,
      `Checks: ${scorecard}`,
      v.product && (v.product.asins || [])[0] ? `ASIN: ${v.product.asins[0]}` : "",
    ].filter(Boolean).join("\n");
    onOpen(`mailto:hello@plasticdetox.org`
      + `?subject=${encodeURIComponent("Correction: " + name)}`
      + `&body=${encodeURIComponent(body)}`);
    send.textContent = "Opening your mail app";
  };
  form.appendChild(send);
  open.onclick = () => {
    form.hidden = !form.hidden;
    if (!form.hidden) ta.focus();
  };
  wrap.appendChild(open);
  wrap.appendChild(form);
  return wrap;
}

/**
 * What a picker row covers, when the name alone does not say.
 *
 * A row scoped to a line and carrying no ASIN is not a product you can hold.
 * Pampers offers "Baby Dry Diapers", "Swaddlers" and plain "Diapers", and the
 * third is the answer for every Pampers diaper the first two do not cover.
 * Sitting unlabelled between two specific packs it just reads as a third pack.
 * The scope is recorded on every row; the picker was not reading it.
 */
function scopeHint(row) {
  const scope = (row.ext || {}).scope;
  if (scope === "line" && !((row.asins || []).length)) return "the rest of this range";
  if (scope === "brand") return "the brand as a whole";
  return "";
}

// The canvas sits the tip at the foot of the Detox screen. Keyed on the day of
// the year, so it needs no storage and no server, everyone sees the same tip on
// the same day, and it comes back around in a year.
function appendTip(root) {
  const tip = tipOfDay();
  if (!tip) return;
  const card = el("div", "tip-card");
  card.appendChild(el("div", "tip-label", "Tip of the day"));
  card.appendChild(el("div", "tip-title", tip.title));
  card.appendChild(el("p", "tip-body", tip.body));
  root.appendChild(card);
}

export function detox(root, { phases, done, seen, room, onRoom, onStep, onKids, onCleared, onSetAside }) {
  const all = phases.reduce((n, p) => n + p.steps.length, 0);
  const ticked = phases.reduce(
    (n, p) => n + p.steps.filter((s) => done.has(s.id)).length, 0);

  const wrap = el("div", "dx-wrap");
  root.appendChild(wrap);

  // Which room you are looking at. With no choice made, the one holding the
  // next undone swap, so the screen always opens where the action is.
  let at = Number(room);
  if (!Number.isInteger(at) || at < 0 || at >= phases.length) {
    at = Math.max(0, phases.findIndex((p) => p.steps.some((s) => !done.has(s.id))));
  }
  const phase = phases[at];

  const setAside = phases.reduce(
    (n, ph) => n + ph.steps.filter((st) => !done.has(st.id) && seen.has(st.id)).length, 0);

  if (ticked >= all && all) {
    const card = el("div", "dx-alldone");
    card.appendChild(el("div", "dx-alldone-k", "Nothing left on your list"));
    card.appendChild(el("div", "dx-alldone-h", `All ${all} sources are done`));
    card.appendChild(el("p", "dx-alldone-p",
      "We will add a source if something new comes into the house, or you can look back over what you completed."));
    const again = el("button", "dx-alldone-cta", "See what you completed");
    again.type = "button";
    again.onclick = () => onCleared && onCleared();
    card.appendChild(again);
    wrap.appendChild(card);
  } else {
    // The count as a ring rather than a bar. A bar reads as a loading state
    // and says nothing until it is nearly full; the ring carries the number,
    // which is the thing someone came back to see.
    const card = el("div", "dx-prog");
    const top = el("div", "dx-prog-top");
    const ring = el("div", "dx-ring");
    ring.style.setProperty("--pct", `${all ? Math.round((ticked / all) * 100) : 0}%`);
    const hole = el("div", "dx-ring-in");
    hole.appendChild(el("b", null, String(ticked)));
    hole.appendChild(el("span", null, `of ${all}`));
    ring.appendChild(hole);
    top.appendChild(ring);
    const side = el("div", "dx-prog-side");
    side.appendChild(el("div", "dx-prog-k", "Sources removed"));
    side.appendChild(el("p", "dx-prog-p",
      "Your list is ranked by how much contact each source causes, so the heaviest ones go first."));
    top.appendChild(side);
    card.appendChild(top);
    if (ticked || setAside) {
      const row = el("div", "dx-prog-row");
      if (ticked) {
        const seeAll = el("button", "dx-prog-cta", `${ticked} completed \u00b7 see the list`);
        seeAll.type = "button";
        seeAll.onclick = () => onCleared && onCleared();
        row.appendChild(seeAll);
      }
      // "Maybe later" used to leave a grey tile on the board. With the board
      // gone there was nowhere for a set aside swap to live, so it vanished
      // until everything else in the room was done.
      if (setAside) {
        const later = el("button", "dx-prog-cta", `${setAside} set aside \u00b7 see the list`);
        later.type = "button";
        later.onclick = () => onSetAside && onSetAside();
        row.appendChild(later);
      }
      card.appendChild(row);
    }
    wrap.appendChild(card);
  }

  appendTip(wrap);

  wrap.appendChild(el("div", "dx-where", "Where do you want to work"));
  const rooms = el("div", "dx-rooms");
  phases.forEach((p, i) => {
    const dn = p.steps.filter((s) => done.has(s.id)).length;
    const pill = el("button", `dx-room${i === at ? " on" : ""}`);
    pill.type = "button";
    const head = el("div", "dx-room-top");
    head.appendChild(el("span", "dx-room-n", roomName(p)));
    head.appendChild(el("span", "dx-room-c", `${dn}/${p.steps.length}`));
    pill.appendChild(head);
    // A pip per source, filled as it clears. It shows the shape of the room
    // at a glance, which a bare count cannot.
    const pips = el("div", "dx-pips");
    for (const st of p.steps) {
      pips.appendChild(el("i", `dx-pip${done.has(st.id) ? " on" : ""}`));
    }
    pill.appendChild(pips);
    pill.onclick = () => onRoom(String(i));
    rooms.appendChild(pill);
  });
  const kids = el("button", "dx-room lock");
  kids.type = "button";
  kids.appendChild(icon("M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v3", 13));
  kids.appendChild(el("span", null, "Kids"));
  kids.onclick = onKids;
  rooms.appendChild(kids);
  wrap.appendChild(rooms);

  // One source at a time, which is the whole idea: the board of thirteen tiles
  // asked you to choose, and choosing is the step people stall on. The next
  // undone swap in this room is simply presented, with the room's own leftovers
  // pointed at once it is clear.
  const next = phase.steps.find((s) => !done.has(s.id) && !seen.has(s.id))
    || phase.steps.find((s) => !done.has(s.id));
  if (!next) {
    const other = phases.findIndex((p) => p.steps.some((s) => !done.has(s.id)));
    if (other >= 0) {
      const note = el("div", "dx-jump",
        `${roomName(phase)} is clear. ${roomName(phases[other])} still has ${
          phases[other].steps.filter((s) => !done.has(s.id)).length} to go.`);
      wrap.appendChild(note);
      const jump = el("button", "dx-quest-cta", `Go to ${roomName(phases[other])}`);
      jump.type = "button";
      jump.onclick = () => onRoom(String(other));
      wrap.appendChild(jump);
    }
  } else {
    const q = el("div", "dx-quest");
    const qt = el("div", "dx-quest-top");
    qt.appendChild(el("span", "dx-quest-k", `Next in ${roomName(phase)}`));
    qt.appendChild(el("span", "dx-quest-tag",
      next.heat ? "Heat driven" : at === 1 ? "Abrasion driven" : "Contact driven"));
    q.appendChild(qt);
    q.appendChild(el("div", "dx-quest-h", next.swap));
    if (next.why) q.appendChild(el("p", "dx-quest-p", next.why));
    const cta = el("button", "dx-quest-cta", "Start this swap");
    cta.type = "button";
    cta.onclick = () => onStep(next.id);
    q.appendChild(cta);
    wrap.appendChild(q);
  }
}
/**
 * The Kids room, before it is unlocked.
 *
 * The room exists on the shelf so a parent knows it is there, and it opens to
 * a teaser rather than a paywall wall of text. The package itself is bought on
 * the website, which is also the Apple compliant path: the app links out, the
 * purchase happens in the browser.
 */
export function detoxKids(root, { onOpen, onLater }) {
  root.appendChild(el("div", "dx-k", "Kids \u00b7 locked"));
  const row = el("div", "dx-titrow");
  row.appendChild(el("div", "dx-title", "The kids room"));
  root.appendChild(row);

  root.appendChild(el("div", "dx-k", "What is inside"));
  root.appendChild(el("p", "dx-why",
    "Bottles and feeding, the nursery, wipes and creams, in the order that matters "
    + "for someone that small. Built from the same testing as everything else here, "
    + "sequenced for the smallest person in the house."));

  root.appendChild(el("div", "dx-k free", "Part of the Baby Package"));
  root.appendChild(el("div", "step-free",
    "The Baby Package is bought on plasticdetox.org and this room opens with it."));

  const foot = el("div", "dx-foot");
  const cta = el("button", "cta", "See the Baby Package");
  cta.onclick = () => onOpen("https://plasticdetox.org/custom-plan.html?app=1");
  foot.appendChild(cta);
  const later = el("button", "dx-ghost", "Maybe later");
  later.onclick = onLater;
  foot.appendChild(later);
  root.appendChild(foot);
}

/**
 * One source, one screen of value.
 *
 * Why it matters in the plan's own words, the picks the plan names with their
 * notes and links, and the free version where one exists, because the cheapest
 * swap is usually a habit and it counts the same. One button marks it done.
 */
export function detoxStep(root, { phase, step, isDone, isSeen, onDone, onUndo, onLater, onOpen, onSavePick, isPickSaved }) {
  const c = stepContent(step);
  root.classList.add("with-foot");

  root.appendChild(el("div", "dx-k",
    `${roomName(phase)} \u00b7 ${isDone ? "done \u2713" : isSeen ? "set aside for now" : "next up"}`));

  // The canvas gives this screen a title and a tag, nothing else. The icon
  // beside it was decoration that cost the headline a third of its width.
  const row = el("div", "dx-titrow");
  row.appendChild(el("div", "dx-title", step.swap));
  row.appendChild(el("span", "dx-heat", step.heat ? "Heat driven" : "Contact driven"));
  root.appendChild(row);

  if (step.why) {
    root.appendChild(el("div", "dx-k", "Why it matters"));
    root.appendChild(el("p", "dx-why", step.why));
  }

  if ((step.picks || []).length) {
    root.appendChild(el("div", "dx-k", "Our picks \u00b7 vetted"));
    for (const pick of step.picks) {
      const p = el("button", "prow dx-pick");
      p.type = "button";
      // The canvas gives every pick a thumbnail. The ASIN is already in the
      // buy link, so the real product image costs nothing to show.
      const asin = (pick.url.match(/\/dp\/([A-Z0-9]{10})/) || [])[1];
      // Not every pick is a product. A guide points at one of our own articles,
      // which ships a hero image, and showing the placeholder instead made the
      // one pick on that step look like a broken row.
      const slug = (pick.url.match(/\/articles\/([\w-]+\.html)/) || [])[1];
      const art = slug && allArticles().find((a) => a.slug === slug);
      const src = asin ? productImage(asin, 160) : (art && art.image) || "";
      const thumb = el("div", "dx-pick-img");
      if (src) {
        const img = document.createElement("img");
        img.src = src;
        img.alt = "";
        img.loading = "lazy";
        img.onerror = () => thumb.classList.add("bare");
        thumb.appendChild(img);
      } else {
        thumb.classList.add("bare");
      }
      p.appendChild(thumb);
      const body = el("div", "row-body");
      body.appendChild(el("div", "prow-name", pick.name));
      if (pick.note) body.appendChild(el("div", "prow-note", pick.note));
      p.appendChild(body);
      const right = el("div", "dx-pick-right");
      if (pick.label) right.appendChild(el("span", "prow-label", pick.label));
      right.appendChild(el("span", "prow-view", "View \u2192"));
      p.appendChild(right);
      p.onclick = () => onOpen(pick.url);

      // Keeping a pick is a separate decision from buying it now, so the heart
      // sits outside the row's own tap target rather than inside it.
      const holder = el("div", "dx-pick-hold");
      holder.appendChild(p);
      if (onSavePick) {
        const on = isPickSaved && isPickSaved(pick);
        const heart = el("button", `pick-heart${on ? " on" : ""}`);
        heart.type = "button";
        heart.setAttribute("aria-label", on ? "Saved" : "Save this pick");
        heart.appendChild(icon(ICONS.heart, 17));
        heart.onclick = (e) => { e.stopPropagation(); onSavePick(pick); };
        holder.appendChild(heart);
      }
      root.appendChild(holder);
    }
  }

  // Where to start, when a swap is really a series of them.
  if (step.order && (step.order.steps || []).length) {
    root.appendChild(el("div", "dx-k", step.order.title || "Where to start"));
    if (step.order.body) root.appendChild(el("p", "dx-why", step.order.body));
    const list = el("ol", "dx-order");
    step.order.steps.forEach((o) => {
      const li = el("li");
      li.appendChild(el("b", null, o.name));
      li.appendChild(el("span", null, o.why));
      list.appendChild(li);
    });
    root.appendChild(list);
  }

  // The thing worth knowing that is not a product.
  if (step.tip && step.tip.body) {
    const box = el("div", "pro-tip");
    box.appendChild(el("div", "pro-tip-k", "Pro tip"));
    if (step.tip.title) box.appendChild(el("div", "pro-tip-h", step.tip.title));
    box.appendChild(el("p", "pro-tip-p", step.tip.body));
    const cols = [["Look for", step.tip.look, "look"], ["Ignore", step.tip.skip, "skip"]];
    for (const [head, items, cls] of cols) {
      if (!(items || []).length) continue;
      box.appendChild(el("div", `pro-tip-sub ${cls}`, head));
      const ul = el("ul", `pro-tip-list ${cls}`);
      for (const one of items) ul.appendChild(el("li", null, one));
      box.appendChild(ul);
    }
    root.appendChild(box);
  }

  if (c.free) {
    root.appendChild(el("div", "dx-k free", "Costs nothing \u00b7 counts the same"));
    root.appendChild(el("div", "step-free dx-free", c.free));
  }

  const foot = el("div", "dx-foot");
  if (!isDone) {
    const cta = el("button", "cta", "Done, next source");
    cta.onclick = onDone;
    foot.appendChild(cta);
    const later = el("button", "dx-ghost", "Maybe later");
    later.onclick = onLater;
    foot.appendChild(later);
  } else {
    const undo = el("button", "cta ghost", "Mark as not done");
    undo.onclick = onUndo;
    foot.appendChild(undo);
  }
  root.appendChild(foot);
}

/**
 * The reward, which is the whole loop.
 *
 * Clearing a source used to drop you back on the grid with a toast, so the
 * moment you finished something looked exactly like the moment before it. The
 * canvas makes it a screen: the count, what you just did, and the next source
 * already queued behind one button, so a motivated person clears a room in one
 * sitting instead of deciding five separate times to carry on.
 */
export function detoxReward(root, { ticked, all, cleared, roomLabel, nextStep, onNext, onClose }) {
  root.classList.add("with-foot");
  const wrap = el("div", "rw");
  const disc = el("div", "rw-disc");
  disc.appendChild(el("b", null, String(ticked)));
  disc.appendChild(el("span", null, `of ${all} completed`));
  wrap.appendChild(disc);
  wrap.appendChild(el("div", "rw-h", `${cleared}, gone`));
  wrap.appendChild(el("div", "rw-chip", roomLabel));
  root.appendChild(wrap);

  const foot = el("div", "rw-foot");
  const cta = el("button", "cta", nextStep ? "Next source" : "Back to my list");
  cta.onclick = () => (nextStep ? onNext() : onClose());
  foot.appendChild(cta);
  if (nextStep) {
    const back = el("button", "dx-ghost", "Back to my list");
    back.onclick = onClose;
    foot.appendChild(back);
  }
  root.appendChild(foot);
}

/**
 * Everything cleared so far, with an undo on each.
 *
 * The count on the Detox screen was the only record of the work, and a number
 * is not a record. This is the list behind it.
 */
export function detoxCleared(root, { rows, onUndo, onClose, title, empty, action }) {
  const veil = el("div", "sheet-veil");
  veil.onclick = onClose;
  root.appendChild(veil);
  const sheet = el("div", "sheet");
  sheet.appendChild(el("div", "sheet-grab"));
  sheet.appendChild(el("h1", "sheet-h", title || "What you completed"));
  if (!rows.length) {
    sheet.appendChild(el("p", "sheet-none", empty || "Nothing completed yet. The first one is the hardest."));
  }
  for (const r of rows) {
    const row = el("div", `clr${action ? " later" : ""}`);
    row.appendChild(el("div", "clr-tick", action ? "\u2013" : "\u2713"));
    const body = el("div", "clr-body");
    body.appendChild(el("div", "clr-t", r.title));
    body.appendChild(el("div", "clr-m", r.meta));
    row.appendChild(body);
    const undo = el("button", "clr-undo", action || "Undo");
    undo.type = "button";
    undo.onclick = () => onUndo(r.id);
    row.appendChild(undo);
    sheet.appendChild(row);
  }
  root.appendChild(sheet);
}

// ------------------------------------------------------------------ saved

export function saved(root, { items, index, onProduct, onOpen, onShop }) {
  const hero = el("div", "hero shop-hero");
  hero.appendChild(el("h1", null, "Saved"));
  hero.appendChild(el("p", null, items.length
    ? `${items.length} kept for later.`
    : "Nothing kept yet."));
  root.appendChild(hero);

  if (!items.length) {
    const empty = el("div", "empty");
    empty.appendChild(el("h2", null, "Your list is empty"));
    empty.appendChild(el("p", null,
      "Tap Save on any product and it waits here, so a shop trip is a list rather than a memory test."));
    const go = el("button", "cta", "Browse what we would buy");
    go.onclick = onShop;
    empty.appendChild(go);
    root.appendChild(empty);
    return;
  }

  const grid = el("div", "pgrid");
  for (const s of items) {
    // Resolve back to the live row, so a saved item shows today's verdict
    // rather than the one it had when it was saved.
    const b = index.brands.find((x) => x.id === s.brandId || x.brand === s.brand);
    const row = b && (b.products || []).find((p) => p.name === s.name);
    if (b && row) {
      grid.appendChild(shopCard({ brand: b, row }, { onOpen, onProduct, eager: true }));
      continue;
    }
    const card = el("div", "pcard");
    const body = el("div", "pcard-body");
    body.appendChild(el("div", "pcard-brand", s.brand));
    body.appendChild(el("div", "pcard-name", s.name));
    card.appendChild(body);
    grid.appendChild(card);
  }
  root.appendChild(grid);
}

// ------------------------------------------------------------------ learn

export function learn(root, { articles, onOpen, query, onQuery }) {
  const hero = el("div", "hero shop-hero");
  hero.appendChild(el("h1", null, "Learn"));
  hero.appendChild(el("p", null,
    `${articles.length} guides on what the research actually says.`));
  root.appendChild(hero);

  const box = el("div", "search shop-search");
  const input = el("input");
  input.type = "search";
  input.placeholder = "Search the guides";
  input.value = query || "";
  input.autocomplete = "off";
  input.oninput = () => onQuery(input.value);
  box.appendChild(icon(ICONS.search, 18));
  box.appendChild(input);
  root.appendChild(box);

  const q = (query || "").trim().toLowerCase();
  const list = q.length >= 2
    ? articles.filter((a) => `${a.title} ${a.blurb}`.toLowerCase().includes(q))
    : articles;

  // The one to read first, which the canvas puts above the list rather than
  // leaving someone to guess where seventy four guides begin.
  if (!q) {
    const start = articles.find((a) => /^getting-started-checklist/.test(a.slug || ""))
      || articles[0];
    if (start) {
      const card = el("button", "start-card");
      card.type = "button";
      card.appendChild(el("div", "start-k", "Start here \u00b7 5 min"));
      card.appendChild(el("div", "start-h", start.title));
      card.appendChild(el("p", "start-p", start.blurb));
      card.onclick = () => onOpen(`https://plasticdetox.org/articles/${start.slug}`);
      root.appendChild(card);
    }
  }

  if (!list.length) {
    root.appendChild(el("p", "note", "No guide matches that yet."));
    return;
  }
  root.appendChild(el("div", "section-title", `All articles \u00b7 ${list.length}`));

  list.forEach((a, i) => {
    const card = el("button", "acard");
    card.type = "button";
    const body = el("div", "acard-body");
    // The canvas leads each row with a kicker. Ours is the article's own
    // subject, taken off the slug, so it names the thing rather than a number.
    const kicker = (a.slug || "").replace(/\.html$/, "").split("-")
      .filter((w) => !/^(best|non|toxic|the|a|for|and|to|in|of|guide|2026)$/i.test(w))
      .slice(0, 2).join(" ");
    if (kicker) body.appendChild(el("div", "acard-k", kicker));
    body.appendChild(el("div", "acard-title", a.title));
    if (a.blurb) body.appendChild(el("div", "acard-blurb", a.blurb));
    card.appendChild(body);
    if (a.image) {
      const im = el("img");
      im.src = a.image; im.alt = "";
      if (i >= 6) im.loading = "lazy";
      im.onerror = () => im.remove();
      card.appendChild(im);
    }
    // app=1 tells the article the app already has a nav, so it drops the
    // site's own header, footer and newsletter block and reads as one screen
    // rather than as a website we sent you to.
    card.onclick = () => onOpen(`https://plasticdetox.org/articles/${a.slug}?app=1`);
    root.appendChild(card);
  });
}

// ------------------------------------------------------------------- shop

/**
 * Everything we would actually buy, by category.
 *
 * Checking a brand answers a question somebody already has. This answers the
 * one they have before they have a brand in mind, which is most of the time
 * and was the half of the app that did not exist. Only rows we rate good and
 * that have somewhere to buy them: a shelf you cannot buy from is a list.
 */
/** Everything we would buy, gathered once. */
/**
 * Which room you would be standing in.
 *
 * The shop groups by category, which is right once you know what you want and
 * useless when you are working through a house. 39 categories is a wall; five
 * rooms is a decision. Kid specific things go to Kids even when they belong to
 * another room, because a crib mattress is what a parent is shopping for, not
 * bedding, and baby bottles are not really kitchenware.
 *
 * Anything unmapped lands in Other rather than disappearing, so adding a
 * category to the database can never quietly empty it out of the shop.
 */
const ROOM_OF = {
  // Kitchen
  "Food storage": "Kitchen", "Tableware": "Kitchen", "Cutting boards": "Kitchen",
  "Water filters": "Kitchen", "Cookware": "Kitchen", "Sea salt": "Kitchen",
  "Pantry": "Kitchen", "Kitchen appliances": "Kitchen", "Air fryers": "Kitchen",
  "Water bottles": "Kitchen", "Chewing gum": "Kitchen",
  // Bedroom
  "Bedding": "Bedroom", "Air purifiers": "Bedroom",
  // Bathroom
  "Skincare": "Bathroom", "Dental floss": "Bathroom", "Makeup": "Bathroom",
  "Toothbrushes": "Bathroom", "Tampons": "Bathroom", "Menstrual cups": "Bathroom",
  "Reusable cloth pads": "Bathroom", "Period pads": "Bathroom", "Razors": "Bathroom",
  "Conditioner": "Bathroom", "Prenatal vitamins": "Bathroom",
  // Kids
  "Toys": "Kids", "Baby bottles": "Kids", "Baby sleep": "Kids",
  "Pacifiers": "Kids", "Cribs & nursery": "Kids", "Crib mattresses": "Kids",
  "Strollers": "Kids", "Teethers": "Kids", "Diapers": "Kids",
  "Breast milk storage": "Kids", "Diaper cream": "Kids",
  // Other: worn or used everywhere rather than in one room
  "Clothing": "Other", "Vacuums": "Other", "Laundry detergent": "Other",
  "Yoga mats": "Other",
};

export const ROOMS = ["Kitchen", "Bedroom", "Bathroom", "Kids", "Other"];

export function roomFor(cat) {
  return ROOM_OF[cat] || "Other";
}

function shelf(index) {
  const out = [];
  for (const b of index.brands) {
    for (const row of (b.products || [])) {
      if (((row.ext || {}).verdict) !== "good") continue;
      if (!(row.asins || []).length) continue;
      out.push({ brand: b, row, cat: row.cat || b.category || "Other" });
    }
  }
  return out;
}

/** One product, as something you can look at rather than read. */
function shopCard({ brand: b, row }, { onOpen, onProduct, eager = false }) {
  const card = el("button", "pcard");
  card.type = "button";

  const shot = el("div", "pcard-img");
  const src = productImage(row.asins[0], 300);
  if (src) {
    const img = el("img");
    img.src = src;
    img.alt = row.name;
    if (!eager) img.loading = "lazy";
    // A missing photo should look deliberate, not broken.
    img.onerror = () => { shot.replaceChildren(el("span", "pcard-fallback", b.brand)); };
    shot.appendChild(img);
  } else {
    shot.appendChild(el("span", "pcard-fallback", b.brand));
  }
  card.appendChild(shot);

  const body = el("div", "pcard-body");
  body.appendChild(el("div", "pcard-brand", b.brand));
  const label = row.name.toLowerCase().startsWith(b.brand.toLowerCase())
    ? row.name.slice(b.brand.length).trim() || row.name : row.name;
  body.appendChild(el("div", "pcard-name", label));

  const fr = (row.ext || {}).fronts || {};
  const done = FRONTS.filter(([k]) => ["pass", "none"].includes(fr[k])).length;
  const marks = el("div", "pcard-checks");
  for (const [k] of FRONTS) {
    const dot = el("i");
    dot.className = ["pass", "none"].includes(fr[k]) ? "on" : "";
    marks.appendChild(dot);
  }
  marks.appendChild(el("em", null, `${done}/4`));
  body.appendChild(marks);
  card.appendChild(body);

  const buy = el("span", "pcard-buy", "View");
  buy.onclick = (e) => { e.stopPropagation(); onOpen(buyLink(row.asins[0])); };
  card.appendChild(buy);

  card.onclick = () => onProduct(b, row);
  return card;
}

export function shopIndex(root, {
  index, onCategory, onOpen, onProduct, query, onQuery, room, onRoom,
}) {
  const shelfAll = shelf(index);
  // The room narrows the shelf itself, so the count, the categories and the
  // search below all describe the same set of things.
  const all = room ? shelfAll.filter((i) => roomFor(i.cat) === room) : shelfAll;
  const groups = new Map();
  for (const item of all) {
    if (!groups.has(item.cat)) groups.set(item.cat, []);
    groups.get(item.cat).push(item);
  }

  const hero = el("div", "hero shop-hero");
  hero.appendChild(el("h1", null, room || "What we would buy"));
  hero.appendChild(el("p", null,
    `${all.length} product${all.length === 1 ? "" : "s"} that cleared our checks, `
    + `across ${groups.size} categor${groups.size === 1 ? "y" : "ies"}.`));
  root.appendChild(hero);

  // Rooms first. Counted from the shelf rather than hardcoded, so a room that
  // holds nothing says so instead of opening an empty grid.
  const strip = el("div", "strip rooms");
  const roomBtn = (label, value, n) => {
    const b = el("button", "chip" + (room === value ? " on" : ""));
    b.type = "button";
    b.appendChild(el("span", "chip-name", label));
    if (n != null) b.appendChild(el("span", "chip-n", String(n)));
    b.onclick = () => onRoom(room === value ? "" : value);
    return b;
  };
  strip.appendChild(roomBtn("All", "", shelfAll.length));
  for (const r of ROOMS) {
    const n = shelfAll.filter((i) => roomFor(i.cat) === r).length;
    if (n) strip.appendChild(roomBtn(r, r, n));
  }
  root.appendChild(strip);

  // Search across the shelf, not the whole database. Everything here is
  // something we would actually buy, so a hit is always an answer.
  const box = el("div", "search shop-search");
  const input = el("input");
  input.type = "search";
  input.placeholder = "Search these picks";
  input.value = query || "";
  input.autocomplete = "off";
  input.oninput = () => onQuery(input.value);
  box.appendChild(icon(ICONS.search, 18));
  box.appendChild(input);
  root.appendChild(box);

  const q = (query || "").trim().toLowerCase();
  if (q.length >= 2) {
    const hits = all.filter(({ brand: b, row, cat }) =>
      `${b.brand} ${row.name} ${cat}`.toLowerCase().includes(q));
    root.appendChild(el("div", "section-title",
      `${hits.length} match${hits.length === 1 ? "" : "es"}`));
    const grid = el("div", "pgrid");
    hits.forEach((item, i) => grid.appendChild(
      shopCard(item, { onOpen, onProduct, eager: i < 8 })));
    root.appendChild(grid);
    if (!hits.length) {
      root.appendChild(el("p", "note", room
        ? `Nothing in ${room.toLowerCase()} matches that yet.`
        : "Nothing on the shelf matches that yet."));
    }
    return;
  }

  root.appendChild(el("div", "section-title", `All picks \u00b7 ${all.length}`));
  const list = el("div", "plist");
  all.forEach((item, i) => list.appendChild(shopRow(item, { onProduct, eager: i < 8 })));
  root.appendChild(list);
}

/**
 * One pick, as the canvas rows it: image, what it is, what it replaces.
 *
 * The canvas also carries a price, which we do not hold, so the row ends at
 * the category rather than showing an invented one.
 */
function shopRow(item, { onProduct, eager }) {
  const { brand: b, row, cat } = item;
  const el_ = el("button", "prow");
  el_.type = "button";
  const thumb = el("div", "prow-img bare");
  const src = productImage((row.asins || [])[0], 200);
  if (src) {
    thumb.classList.remove("bare");
    const im = el("img");
    im.src = src; im.alt = "";
    if (!eager) im.loading = "lazy";
    im.onerror = () => im.remove();
    thumb.appendChild(im);
  }
  el_.appendChild(thumb);
  const body = el("div", "row-body");
  body.appendChild(el("div", "prow-name", row.name || b.brand));
  body.appendChild(el("div", "prow-note", `${b.brand} \u00b7 ${cat}`));
  el_.appendChild(body);
  el_.onclick = () => onProduct(b, row);
  return el_;
}

export function shopCategory(root, { index, category, onProduct, onOpen }) {
  const items = shelf(index).filter((i) => i.cat === category);

  const hero = el("div", "hero shop-hero");
  hero.appendChild(el("h1", null, category));
  hero.appendChild(el("p", null,
    `${items.length} that cleared all the checks we could run.`));
  root.appendChild(hero);

  const grid = el("div", "pgrid");
  items.forEach((item, i) => grid.appendChild(
    shopCard(item, { onOpen, onProduct, eager: i < 8 })));
  root.appendChild(grid);
}

// ----------------------------------------------------------------- result

/**
 * The verdict screen.
 *
 * `scan` is the barcode database record when we got here from the camera, and
 * carries the packaging read. It is rendered even when we know the brand,
 * because "good brand, PET bottle" is a real and common answer.
 */

/**
 * The exposure line, said the way a person would say it.
 *
 * The model already decides this once per product type, so every row has one.
 * It belongs beside the verdict rather than three cards down, because it is
 * the reason three small findings add up to an answer on a diaper cream and
 * would not on a hand cream.
 */
const CONTACT = {
  "leave-on": "left on skin", swallowed: "swallowed", spat: "spat out",
  rinsed: "rinsed off", transfer: "passed into what you eat or drink",
  prolonged: "in contact for hours", breathed: "breathed in",
};
const HOW_OFTEN = {
  "several daily": "several times a day", daily: "every day",
  weekly: "most weeks", rare: "now and then",
};

function exposureBlock(ex) {
  if (!ex || !ex.level) return null;
  const box = el("div", `expo ${ex.level}`);
  // "HIGH" on its own reads as a rating of the product rather than of the
  // contact, which is the opposite of what it means.
  const level = String(ex.level);
  box.appendChild(el("span", `pkg-chip ${ex.level}`,
    `${level.charAt(0).toUpperCase()}${level.slice(1)} exposure`));
  const why = el("div", "expo-why");
  const bits = [
    ex.baby ? "On a baby" : null,
    CONTACT[ex.retained] || null,
    HOW_OFTEN[ex.frequency] || null,
  ].filter(Boolean);
  if (bits.length) {
    const line = bits.join(", ") + ".";
    why.appendChild(el("b", null, line.charAt(0).toUpperCase() + line.slice(1)));
  }
  if (ex.why) why.appendChild(document.createTextNode(ex.why));
  box.appendChild(why);
  return box;
}

/**
 * The label we read, with the words we objected to marked inside it.
 *
 * Every scanner app hands out a score. Almost none show the list they read it
 * from. This is the part that makes a verdict checkable rather than another
 * opinion, which is why the terms are stored rather than parsed back out of
 * our own sentence.
 */
function ingredientsCard(fa) {
  if (!fa || !fa.ingredients) return null;
  const box = el("div", "card ing-card");
  box.appendChild(el("h2", null, "What is in it"));
  const p = el("p", "ing-list");
  const terms = (fa.flagged || []).filter(Boolean);
  const rx = terms.length
    ? new RegExp("(" + terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")s?", "ig")
    : null;
  const text = fa.ingredients;
  if (!rx) {
    p.textContent = text;
  } else {
    let last = 0, m;
    while ((m = rx.exec(text)) !== null) {
      if (m.index > last) p.appendChild(document.createTextNode(text.slice(last, m.index)));
      p.appendChild(el("mark", null, m[0]));
      last = m.index + m[0].length;
      if (rx.lastIndex === m.index) rx.lastIndex++;
    }
    if (last < text.length) p.appendChild(document.createTextNode(text.slice(last)));
  }
  box.appendChild(p);
  if (fa.checked) box.appendChild(el("div", "ing-src", `Read from the label, ${fa.checked}.`));
  return box;
}

/**
 * The one story worth telling about this product, where there is one.
 *
 * Deliberately conditional. A card that always appears and is sometimes filler
 * is worth less than one that appears only when we have something.
 */
function worthKnowing(ext, fronts, shown = []) {
  if (!ext) return null;
  const k = ext.classEvidence;
  const legal = ((fronts && fronts.legal) || {}).status;
  const legalNote = ext.legalNote || "";
  let body = null;
  if (k && k.detail) body = k.detail + (k.source ? ` (${k.source})` : "");
  else if (["caution", "fail"].includes(legal) && legalNote.length > 90) body = legalNote;
  if (!body) return null;

  // The scorecard above shows the first sentence of a long note. Repeating it
  // verbatim here made the card read as a rendering bug rather than as detail,
  // so this picks up where the row left off. If nothing is left, there was no
  // detail to add and the card does not appear at all.
  for (const seen of shown) {
    const t = String(seen || "").trim();
    if (t.length > 40 && body.startsWith(t)) body = body.slice(t.length).trim();
  }
  if (body.length < 60) return null;
  const box = el("div", "card know");
  box.appendChild(el("h2", null, "Worth knowing"));
  box.appendChild(el("p", null, body));
  return box;
}

export function result(root, { index, match, scan, product, query, productNamed,
  onOpen, onPick, onProduct, onSave, isSaved, onRequest }) {
  const v = verdictFor(match, { title: (scan && scan.title) || query || "", product, productNamed });

  const stanceClass = v.asserted && ["good", "careful", "skip"].includes(v.stance)
    ? ` v-${v.stance}` : "";
  const card = el("div", "verdict" + stanceClass);
  root.classList.add("tinted");
  const head = el("div", "verdict-head");

  if (onSave) {
    const keepName = (v.product && v.product.name) || v.brand.category || v.brand.brand;
    const on = isSaved && isSaved(v.brand.brand, keepName);
    const heart = el("button", `heart${on ? " on" : ""}`);
    heart.type = "button";
    heart.setAttribute("aria-label", on ? "Saved" : "Save");
    heart.appendChild(icon(ICONS.heart, 20));
    heart.onclick = () => onSave(v.brand, v.product || { name: keepName, cat: v.brand.category });
    head.appendChild(heart);
  }

  // A stance badge asserts that a person stood behind this verdict. Anything
  // we have not reviewed says so instead of wearing a colour it has not earned.
  // A badge asserts a verdict. Where the gate did not let one through, the
  // badge says so rather than borrowing the brand's.
  head.appendChild(!v.reviewed
    ? el("span", "badge neutral", "Research, not yet reviewed")
    : v.asserted
      ? el("span", `badge ${v.stance}`, STANCE_LABEL[v.stance] || "Context")
      : el("span", "badge neutral", "No verdict on this product"));

  head.appendChild(el("div", "verdict-brand", v.brand.brand));
  head.appendChild(el("div", "verdict-cat",
    v.level === "product" && v.product ? `${v.product.name} · ${v.brand.category}` : v.brand.category));
  if (v.reason) head.appendChild(el("p", "verdict-reason", v.reason));

  const expo = exposureBlock(v.ext && v.ext.exposure);
  if (expo) head.appendChild(expo);

  if (v.brandReason) {
    const bl = el("div", "verdict-scope");
    bl.appendChild(el("b", null, "About the brand: "));
    bl.appendChild(document.createTextNode(v.brandReason));
    head.appendChild(bl);
  } else if (!v.asserted) {
    // Say what is missing, in the data's own words where it has them.
    const box = el("div", "verdict-scope");
    box.appendChild(document.createTextNode(
      v.why || `We have researched ${v.brand.brand}, but not this exact product, so we are not putting a verdict on it.`));
    head.appendChild(box);
  } else if (v.scoped) {
    head.appendChild(el("div", "verdict-scope",
      `This is our finding on ${v.brand.brand} ${String(v.brand.category || "").toLowerCase()} generally. We have not researched this exact product.`));
  } else if (v.level === "brand") {
    // Knowing the brand is not knowing the product. Say so rather than let a
    // brand judgement pass itself off as a verdict on the thing being held.
    head.appendChild(el("div", "verdict-scope",
      "This is our read on the brand. We have not researched this exact product, so treat it as context rather than a verdict on what you are holding."));
  }
  card.appendChild(head);

  // Show what was checked, and name what was not, rather than printing four
  // rows where three of them say "not yet checked".
  //
  // The four-front data lives on product rows. Brand entries barely carry it:
  // 455 of the 457 brands we rate good have at least one unassessed front, and
  // 86 have none at all. A full scorecard drawn from a brand therefore reads as
  // a half-finished verdict, which is how this looked on a Caboo scan. Same
  // rule the extension has always used.
  const statusOf = (k) => ((v.fronts && v.fronts[k]) || {}).status || "unknown";
  // A front that does not apply is not a check anybody wants to read. A kettle
  // has no ingredient list, and a row saying so is a line of furniture between
  // the reader and the findings that do apply.
  const applies = ([k]) => !(k === "formula" && statusOf(k) === "none");
  const flagged = FRONTS.filter((f) => applies(f) && ["caution", "fail"].includes(statusOf(f[0])));
  const populated = FRONTS.filter((f) => applies(f) && statusOf(f[0]) !== "unknown");
  const positive = v.asserted && v.stance === "good";
  const shown = positive ? populated : (flagged.length ? flagged : populated);
  const unassessed = FRONTS.filter((f) => applies(f) && statusOf(f[0]) === "unknown");

  const printed = [];
  const fronts = el("div", "fronts");
  if (shown.length) {
    fronts.appendChild(el("div", "fronts-label", positive
      ? (v.level === "product" ? "How we checked this product" : "How we checked the brand")
      : (flagged.length ? "Why we flag it" : "What we checked")));
  }
  for (const [key, label] of shown) {
    const f = (v.fronts && v.fronts[key]) || { status: "unknown" };
    const st = f.status || "unknown";
    const line = el("div", `front ${st}`);
    line.appendChild(el("span", `front-mark ${st}`, STATUS_GLYPH[st]));
    const body = el("div", "row-body");
    body.appendChild(el("div", "front-name", label));
    const note = splitNote(f.note);
    const full = (note && note.main) || describeFront(st);
    const shortNote = full.length > 200 ? full.split(/(?<=\.)\s+/)[0] : full;
    printed.push(shortNote);
    body.appendChild(el("div", "front-note", shortNote));
    // The card already said this finding is about the brand generally. A second
    // aside under the front says it again in different words.
    if (note && note.scope && !v.scoped) body.appendChild(el("div", "front-scope", note.scope));
    line.appendChild(body);
    fronts.appendChild(line);
  }
  // Only a recommendation owes the reader a list of what we have not looked at.
  if (positive && unassessed.length) {
    fronts.appendChild(el("div", "fronts-unassessed",
      "Not yet assessed: " + unassessed.map(([, l]) => l.toLowerCase()).join(", ")));
  }
  // Reasons the four fronts have no place for. A brand can be cautioned for
  // going out of business, or for an efficacy claim, and none of formula,
  // materials, legal or testing is where that lives. The site has rendered
  // these as "Worth a caution" since launch, from brand.cautions. The app
  // never read the field, so Andy Pandy showed a CAREFUL badge over an empty
  // "why we flag it" while the website explained itself perfectly.
  // The measurements themselves. A card that says "independent testing found
  // lead" is weaker than one that says 913 ppb arsenic, and we hold 108 of
  // these figures. Nothing rendered them until now.
  const results = ((v.ext || {}).testingResults || []).filter(Boolean);
  if (results.length) {
    const rw = el("div", "lab");
    rw.appendChild(el("div", "fronts-label", "What the lab measured"));
    for (const r of results) {
      const line = el("div", "lab-row");
      const val = r.outcome === "non-detect"
        ? "non detect"
        : (r.value != null ? `${r.value}${r.unit ? " " + r.unit : ""}` : String(r.outcome || ""));
      line.appendChild(el("span", `lab-val ${r.outcome === "non-detect" ? "clean" : "hit"}`, val));
      const b2 = el("div", "row-body");
      b2.appendChild(el("div", "lab-analyte", String(r.analyte || "")));
      const bits = [r.lab, r.year, r.lod ? `LOD ${r.lod}` : ""].filter(Boolean);
      if (bits.length) b2.appendChild(el("div", "lab-src", bits.join(" · ")));
      line.appendChild(b2);
      rw.appendChild(line);
    }
    fronts.appendChild(rw);
  }

  const cautions = ((v.brand || {}).cautions || []).filter(Boolean);
  if (cautions.length) {
    const cw = el("div", "cautions");
    cw.appendChild(el("div", "fronts-label", "Worth a caution"));
    for (const t of cautions) cw.appendChild(el("p", "caution-line", String(t)));
    fronts.appendChild(cw);
  }

  if (fronts.childNodes.length) card.appendChild(fronts);

  root.appendChild(card);

  if (v.heldBack && v.heldBack.length) {
    const held = el("div", "card");
    held.appendChild(el("h2", null, "Why there is no recommendation"));
    held.appendChild(el("p", null, v.why ||
      `A recommendation needs all four checks. Still to do: ${v.heldBack.join(", ")}.`));
    root.appendChild(held);
  }

  if (v.level === "brand") {
    const rows = ratedProducts(v.brand);
    if (rows.length) {
      const box = el("div", "card");
      box.appendChild(el("h2", null, "Which one do you have?"));
      box.appendChild(el("p", "pkg-why",
        "We rate these separately, because they do not all behave the same way."));
      for (const { row, stance } of rows) {
        const line = el("button", "row");
        line.appendChild(el("span", `dot ${stance}`));
        const body = el("div", "row-body");
        body.appendChild(el("div", "row-name", row.name));
        const hint2 = scopeHint(row);
        body.appendChild(el("div", "row-sub", hint2
          ? `${STANCE_LABEL[stance] || "Context"} · ${hint2}`
          : (STANCE_LABEL[stance] || "Context")));
        line.appendChild(body);
        line.appendChild(el("span", "row-chev", "›"));
        line.onclick = () => onProduct(row);
        box.appendChild(line);
      }
      root.appendChild(box);
    }
  }

  // Knowing the brand is not knowing the product, and somebody standing in a
  // shop with the thing in their hand is the best possible moment to ask. The
  // unknown screen already offered this; a card that says "no verdict on this
  // product" and then offers nothing was the dead end.
  if (onRequest && !v.asserted) {
    const ask = el("div", "card");
    ask.appendChild(el("h2", null, "Want us to check this one?"));
    ask.appendChild(el("p", null,
      `Leave your email and we will research ${v.brand.brand}`
      + `${v.product && v.product.name ? " " + v.product.name : ""} by hand `
      + "and send you the verdict, usually within 2 business days."));
    const input = el("input");
    input.type = "email";
    input.placeholder = "you@email.com";
    input.autocapitalize = "none";
    input.autocomplete = "email";
    ask.appendChild(input);
    const btn = el("button", "cta ghost", "Request a free check");
    btn.onclick = () => onRequest(
      v.brand.brand, (v.product && v.product.name) || query || "", input.value, btn);
    ask.appendChild(btn);
    root.appendChild(ask);
  }

  const ing = ingredientsCard(v.ext && v.ext.formulaAnswers);
  if (ing) root.appendChild(ing);

  const know = worthKnowing(v.ext, v.fronts, printed);
  if (know) root.appendChild(know);

  if (scan) root.appendChild(materialsCard(scan, onOpen));

  const alts = v.stance === "good"
    ? []
    : alternativesFor(index, v.brand, 3, (v.product && v.product.cat) || "");
  if (alts.length) {
    const box = el("div", "card alt-card");
    box.appendChild(el("h2", null, "What we would buy instead"));
    for (const { brand: b, row: pr } of alts) {
      const row = el("button", "row");
      row.appendChild(el("span", "dot good"));
      const body = el("div", "row-body");
      // Many rows already carry the brand in their name, so prefixing it gave
      // "Forlife Forlife Stainless Steel Tea Infuser".
      const label = pr.name.toLowerCase().startsWith(b.brand.toLowerCase())
        ? pr.name : `${b.brand} ${pr.name}`;
      body.appendChild(el("div", "row-name", label));
      // The row's own sentence, not the brand's. A brand blurb here is how a
      // good brand's bad product ends up recommended.
      body.appendChild(el("div", "row-sub", (pr.note || "").split(". ")[0] || b.category));
      row.appendChild(body);
      row.appendChild(el("span", "row-chev", "›"));
      row.onclick = () => onPick({ brand: b });
      box.appendChild(row);
    }
    root.appendChild(box);
  }

  // Buying is the action this screen exists to serve, so it leads. The
  // research is the reason to trust the answer and sits under it. Brand Check
  // is the same verdict on another surface, which is a link to where you
  // already are, so it is gone.
  //
  // Only where we would actually buy it: a View button under a skip is an
  // invitation to buy the thing we just told you not to.
  const asin = (v.product && (v.product.asins || [])[0])
    || ((v.brand.products || []).find((p) => (p.ext || {}).verdict === "good"
          && (p.asins || []).length) || {}).asins?.[0];
  if (asin && v.stance === "good") {
    const buy = el("a", "cta", "View \u2192");
    buy.href = buyLink(asin);
    buy.onclick = (e) => { e.preventDefault(); onOpen(buy.href); };
    root.appendChild(buy);
  }
  if (v.article) {
    const a = el("a", asin && v.stance === "good" ? "cta ghost" : "cta", "Read the research");
    a.href = `${SITE}/articles/${v.article}`;
    a.onclick = (e) => { e.preventDefault(); onOpen(a.href); };
    root.appendChild(a);
  }

  root.appendChild(reportCard(v, onOpen));

  return v;
}

function describeFront(status) {
  return {
    pass: "Checked and clear.",
    caution: "Checked, with something worth knowing.",
    fail: "Checked, and it failed.",
    unknown: "Not yet checked.",
  }[status] || "Not yet checked.";
}

/**
 * What the package is made of.
 *
 * Shown on every scan, brand known or not, because it is the one answer we can
 * give about a product nobody has researched.
 */
function materialsCard(scan, onOpen) {
  const box = el("div", "card");
  box.appendChild(el("h2", null, "The materials"));

  const headline = packagingHeadline(scan.materials);
  if (!headline) {
    box.appendChild(el("p", "pkg-why",
      "The barcode databases do not record what this one is packaged in. If it is a bottle or a pouch, assume plastic."));
    return box;
  }

  box.appendChild(el("p", null, headline.text));
  for (const m of scan.materials) {
    const row = el("div", "pkg");
    row.appendChild(el("span", `pkg-chip ${m.concern}`, m.label));
    row.appendChild(el("span", "pkg-why", m.why));
    box.appendChild(row);
  }

  const withArticle = scan.materials.find((m) => m.article);
  if (withArticle) {
    const a = el("a", "cta ghost", "Why this plastic matters");
    a.href = `${SITE}/${withArticle.article}`;
    a.onclick = (e) => { e.preventDefault(); onOpen(a.href); };
    box.appendChild(a);
  }
  return box;
}

// ---------------------------------------------------------------- unknown

/**
 * The screen for a product we have never researched.
 *
 * This is the common case in a supermarket and it has to feel like an answer,
 * not a dead end. So it leads with whatever the packaging tells us, which is
 * often the thing the person actually wanted to know, and offers to put the
 * brand in the queue.
 */
export function unknown(root, { scan, brand, product, hasPass, onCheck, onRequest, onBuy, onOpen, onSearch, onPaste }) {
  const named = [brand, product].filter(Boolean).join(" ").trim()
    || (scan && (scan.brandName || scan.title)) || "";

  // No verdict here, so no verdict colour on the edge. The wash still applies:
  // it is the brand, not a judgement.
  const card = el("div", "verdict");
  root.classList.add("tinted");
  const head = el("div", "verdict-head");
  head.appendChild(el("span", "badge neutral", "Not reviewed yet"));
  head.appendChild(el("div", "verdict-brand",
    named ? `We have not checked ${named} yet.` : "We have not checked that yet."));
  card.appendChild(head);
  root.appendChild(card);

  // Same two ways forward as the site: pay for the automated check now, or ask
  // a person to do it for free and wait two business days.
  const now = el("div", "card");
  now.appendChild(el("h2", null, "Get it checked now"));
  now.appendChild(el("p", null,
    "Our research system runs the same four checks we use for every verdict: formula, materials, recalls and lawsuits, independent tests. It answers in about a minute and shows its sources."));

  const log = el("div", "checklog");
  now.appendChild(log);

  if (hasPass) {
    const go = el("button", "cta", "Run the check");
    go.onclick = () => onCheck(go, log);
    now.appendChild(go);
  } else {
    now.appendChild(el("p", "pkg-why", "Checks come in packs, starting at $5 for 20."));
    const buy = el("button", "cta", "Get checks");
    buy.onclick = onBuy;
    now.appendChild(buy);
    const paste = el("button", "cta ghost", "I already have a pass");
    paste.onclick = onPaste;
    now.appendChild(paste);
  }
  root.appendChild(now);

  if (named) {
    const free = el("div", "card");
    free.appendChild(el("h2", null, "Or request a free review"));
    free.appendChild(el("p", null,
      `Leave your email and our team will research ${named} by hand and email you the verdict, usually within 2 business days.`));
    const input = el("input");
    input.type = "email";
    input.placeholder = "you@email.com";
    input.autocapitalize = "none";
    input.autocomplete = "email";
    free.appendChild(input);
    const btn = el("button", "cta ghost", "Request free review");
    btn.onclick = () => onRequest(input.value, btn);
    free.appendChild(btn);
    root.appendChild(free);
  }

  if (scan) root.appendChild(materialsCard(scan, onOpen));

  const box = el("div", "search");
  box.appendChild(icon(ICONS.search, 18));
  const input = el("input");
  input.type = "search";
  input.placeholder = "Search our database instead";
  input.value = brand || "";
  input.autocapitalize = "none";
  input.oninput = () => onSearch(input.value, results);
  box.appendChild(input);
  root.appendChild(box);
  const results = el("div", "results");
  root.appendChild(results);
  if (brand) onSearch(brand, results);
}

/** One front as it arrives from the check stream. */
export function checkRow(step, front, label) {
  const row = el("div", `front ${front.status === "none" ? "unknown" : front.status}`);
  const glyph = { pass: "\u2713", caution: "!", fail: "\u2715" }[front.status] || "?";
  row.appendChild(el("span", `front-mark ${front.status === "none" ? "unknown" : front.status}`, glyph));
  const body = el("div", "row-body");
  body.appendChild(el("div", "front-name", label));
  if (front.note) body.appendChild(el("div", "front-note", front.note));
  if (front.source) {
    const a = el("a", "front-source", "source");
    a.href = front.source;
    a.target = "_blank";
    a.rel = "noopener";
    body.appendChild(a);
  }
  row.appendChild(body);
  return row;
}

/** The verdict the check settled on, in the same words the site uses. */
export function checkVerdict(event) {
  const names = { good: "Good choice", careful: "Careful", skip: "Skip", unrated: "Not enough found" };
  const box = el("div", "check-result");
  box.appendChild(el("span", `badge ${event.verdict === "unrated" ? "neutral" : event.verdict}`,
    names[event.verdict] || event.verdict));
  if (event.label) box.appendChild(el("div", "check-label", event.label));
  if (event.capNote) box.appendChild(el("p", "pkg-why", event.capNote));
  if (event.consumed) {
    box.appendChild(el("p", "pkg-why",
      "1 check used. This research will join our public database after review, free for everyone."));
  }
  return box;
}

// ------------------------------------------------------------------ about

export function about(root, { meta, bundle, onOpen }) {
  root.appendChild(el("div", "hero")).appendChild(el("h1", null, "How this works"));

  const how = el("div", "card");
  how.appendChild(el("h2", null, "The four fronts"));
  how.appendChild(el("p", null,
    "Every product we recommend has to pass all four: what it is made of, what it is packaged in, whether it has been recalled or sued over, and what independent lab testing found. A product missing any of the four gets no recommendation, which is why you will see honest blanks."));
  root.appendChild(how);

  const data = el("div", "card");
  data.appendChild(el("h2", null, "The database"));
  data.appendChild(el("p", null,
    `${meta.brands} brands, researched and reviewed by hand. Verdicts refresh in the background, so a recall lands here without waiting for an app update.`));
  data.appendChild(el("p", "pkg-why", meta.fetched
    ? `Last updated ${new Date(meta.fetched).toLocaleDateString()}.`
    : "Using the version that shipped with the app."));
  // Which build is actually running.
  //
  // Neither of us could see this, so an update that never landed and an update
  // that landed and reverted looked identical from the outside, and the only
  // evidence was somebody saying the app looked old. Now it says so itself.
  const line = el("p", "pkg-why");
  line.id = "bundle-line";
  line.textContent = "App build: checking…";
  data.appendChild(line);
  Promise.resolve(bundle && bundle()).then((info) => {
    line.textContent = info
      ? `App build ${info.version}${info.builtin ? " (shipped with the app)" : ""}.`
      : "App build: bundled version.";
  }).catch(() => { line.textContent = "App build: bundled version."; });
  root.appendChild(data);

  const links = el("div", "card");
  links.appendChild(el("h2", null, "More"));
  for (const [label, path] of [
    ["Brand Check on the web", "brand-check.html"],
    ["The store", "store.html"],
    ["Privacy", "privacy.html"],
  ]) {
    const a = el("a", "cta ghost", label);
    a.href = `${SITE}/${path}`;
    a.onclick = (e) => { e.preventDefault(); onOpen(a.href); };
    links.appendChild(a);
  }
  root.appendChild(links);

  root.appendChild(el("p", "note",
    "Some links on plasticdetox.org are affiliate links. They never change a verdict."));
}

// --------------------------------------------------------------- category

/**
 * Everything we hold in one category, best first.
 *
 * Ordered good, then careful, then skip, because someone browsing a category
 * is shopping rather than checking, and the answer they want is at the top.
 */
export function category(root, { label, brands, onPick }) {
  const hero = el("div", "hero");
  hero.appendChild(el("h1", null, label));
  hero.appendChild(el("p", null, `${brands.length} brand${brands.length === 1 ? "" : "s"} researched`));
  root.appendChild(hero);

  const order = { good: 0, careful: 1, neutral: 2, skip: 3 };
  const sorted = [...brands].sort((a, b) =>
    (order[a.stance] ?? 9) - (order[b.stance] ?? 9) || a.brand.localeCompare(b.brand));

  let heading = null;
  for (const b of sorted) {
    if (b.stance !== heading) {
      heading = b.stance;
      root.appendChild(el("div", "section-title", STANCE_LABEL[heading] || "Context"));
    }
    const row = el("button", "row");
    row.appendChild(el("span", `dot ${b.stance || "neutral"}`));
    const body = el("div", "row-body");
    body.appendChild(el("div", "row-name", b.brand));
    body.appendChild(el("div", "row-sub", b.evidence || b.category));
    row.appendChild(body);
    row.appendChild(el("span", "row-chev", "›"));
    row.onclick = () => onPick({ brand: b });
    root.appendChild(row);
  }
}



// ------------------------------------------------------- category index

/**
 * Every category we hold, commonest first.
 *
 * Sorted by how much we have researched rather than alphabetically, because
 * the useful answer to "what do you cover" is the areas we cover deeply, and
 * an A to Z buries 144 cookware brands under Activewear.
 */
export function categoryIndex(root, { groups, onPick }) {
  const hero = el("div", "hero");
  hero.appendChild(el("h1", null, "All categories"));
  hero.appendChild(el("p", null, `${groups.length} categories, ${groups.reduce((n, g) => n + g.count, 0)} brands researched`));
  root.appendChild(hero);

  for (const g of groups) {
    const row = el("button", "row");
    row.appendChild(el("span", "dot brand"));
    const body = el("div", "row-body");
    body.appendChild(el("div", "row-name", g.category));
    body.appendChild(el("div", "row-sub",
      `${g.count} brand${g.count === 1 ? "" : "s"}` + (g.good ? ` · ${g.good} we would buy` : "")));
    row.appendChild(body);
    row.appendChild(el("span", "row-chev", "›"));
    row.onclick = () => onPick(g);
    root.appendChild(row);
  }
}
