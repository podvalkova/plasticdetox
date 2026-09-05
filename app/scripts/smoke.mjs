// Walk every screen in a real browser and fail on any error.
//
// Written after shipping a bundle whose home screen threw on every render: a
// rewrite deleted two helpers and left the calls behind. Nothing caught it
// because the checks ran against a fresh install, where there is no history and
// the camera is available, so neither missing function was ever called.
//
// So this seeds the state a real person is in before it looks at anything.
//
// Puppeteer lives in the images/ project rather than here; if it is missing
// this exits 0 with a warning rather than blocking a release on a dev-only
// dependency.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const APP = path.resolve(import.meta.dirname, "..");
const PUPPETEER = path.resolve(APP, "..", "images", "node_modules", "puppeteer");
if (!fs.existsSync(PUPPETEER)) {
  console.warn("smoke: puppeteer not found, skipping");
  process.exit(0);
}

const { default: puppeteer } = await import(PUPPETEER + "/lib/esm/puppeteer/puppeteer.js")
  .catch(() => import(PUPPETEER));

const PORT = 4399;
const server = spawn(process.execPath, [path.join(APP, "scripts", "serve.mjs")], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: "ignore",
});
const stop = () => { try { server.kill(); } catch {} };
process.on("exit", stop);

await new Promise((r) => setTimeout(r, 900));

const base = `http://localhost:${PORT}`;
const errors = [];
// Six screens each load and parse the full brand file, and the default 30s
// protocol timeout is measured per CDP call, not per screen. As the data grew
// past 2.5MB the later screens started tripping it, which reads as four broken
// screens when nothing is broken. This is a smoke test, not a perf budget.
const browser = await puppeteer.launch({
  headless: "new", args: ["--no-sandbox"], protocolTimeout: 180000,
});

async function screen(label, steps, { recents = true } = {}) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  // Noise that only exists off-device: the dev server's origin is not in the
  // worker's CORS allowlist (the app's capacitor://localhost is), and the OTA
  // refresh 404s against a local server. Both are already swallowed by the app.
  const dev = /Failed to load resource|blocked by CORS|net::ERR_FAILED/i;
  page.on("console", (m) => {
    if (m.type() === "error" && !dev.test(m.text())) {
      errors.push(`${label}: console ${m.text().slice(0, 160)}`);
    }
  });
  await page.setViewport({ width: 393, height: 852, isMobile: true });
  await page.goto(base, { waitUntil: "networkidle0" });
  if (recents) {
    // The state a real person is in. A fresh install has none of this, which is
    // exactly why a fresh install proved nothing.
    await page.evaluate(() => {
      localStorage.setItem("pd.recents.v1", JSON.stringify([
        { id: "brita", name: "Brita", sub: "Water filter", stance: "skip" },
        { id: "stanley", name: "Stanley", sub: "Coolers", stance: "good" },
      ]));
      // Each screen starts where a person opening the app starts. The app now
      // resumes where you left off, which is right for a person and wrong for
      // a test: without this every screen began wherever the last one ended.
      localStorage.removeItem("pd.place.v1");
    });
    await page.reload({ waitUntil: "networkidle0" });
  }
  await new Promise((r) => setTimeout(r, 1500));
  try {
    await steps(page);
  } catch (e) {
    errors.push(`${label}: ${e.message}`);
  }
  // The error boundary is a rendered screen, so it never throws. It has to be
  // looked for, or a broken screen passes as a working one.
  const broke = await page.$$eval(".empty h2", (ns) => ns.map((n) => n.textContent))
    .catch(() => []);
  if (broke.some((t) => /did not load/i.test(t))) errors.push(`${label}: error boundary shown`);
  await page.close();
}

// Puppeteer's own click() and type() hang in this environment: both issue a
// Runtime.callFunctionOn to scroll the element into view and compute its box,
// and that call never returns. Raising protocolTimeout to 180s changed
// nothing, so it is a hang and not slowness. The split in the results is the
// tell: every screen that failed drove the page through Puppeteer input, and
// every screen that passed did its clicking inside page.evaluate. So do the
// same everywhere. It also matches what the app actually receives, since a
// real tap arrives as a DOM event either way.
const tap = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) throw new Error(`nothing to click at ${s}`);
  el.click();
}, sel);

const fill = (page, sel, i, text) => page.evaluate((s, n, t) => {
  const el = document.querySelectorAll(s)[n];
  if (!el) throw new Error(`no field ${n} at ${s}`);
  el.value = t;
  // Vanilla listeners key off input, not on assignment to .value.
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}, sel, i, text);

const need = async (page, sel, what) => {
  const found = await page.$(sel);
  if (!found) throw new Error(`missing ${what} (${sel})`);
};

await screen("home", async (p) => {
  await need(p, ".check-form", "check form");
  const fields = await p.$$(".field input");
  if (fields.length !== 2) throw new Error(`expected 2 fields, got ${fields.length}`);
  await need(p, ".chip", "recent chip");
  // Browse moved out of Check and became the Shop tab, so the way to
  // everything we recommend is the bar rather than a row on this screen.
  await need(p, ".tabs", "tab bar");
});

await screen("known product", async (p) => {
  await fill(p, ".field input", 0, "Brita");
  await fill(p, ".field input", 1, "Elite");
  await tap(p, ".check-form .cta");
  await new Promise((r) => setTimeout(r, 700));
  await need(p, ".verdict-brand", "verdict");
  await need(p, ".front", "front rows");
});

await screen("unknown product", async (p) => {
  await fill(p, ".field input", 0, "Kelloggs");
  await fill(p, ".field input", 1, "Corn Flakes");
  await tap(p, ".check-form .cta");
  await new Promise((r) => setTimeout(r, 700));
  await need(p, ".badge", "not reviewed badge");
  const ctas = await p.$$eval(".card .cta", (ns) => ns.map((n) => n.textContent.trim()));
  for (const want of ["Get checks", "Request free review"]) {
    if (!ctas.some((t) => t.includes(want))) throw new Error(`missing "${want}"`);
  }
});

await screen("detox", async (p) => {
  await p.evaluate(() => [...document.querySelectorAll(".tab")]
    .find((t) => /Detox/.test(t.textContent)).click());
  await new Promise((r) => setTimeout(r, 700));
  await need(p, ".dx-ring", "progress ring");
  await need(p, ".tip-card", "tip of the day");
  await need(p, ".dx-room .dx-pip", "room pips");
  await need(p, ".dx-quest-cta", "the next swap");
  // Into a swap, and through it, which is the loop the design is built on.
  await p.evaluate(() => document.querySelector(".dx-quest-cta").click());
  await new Promise((r) => setTimeout(r, 600));
  await need(p, ".dx-pick", "vetted picks");
  // The buttons are pinned, and the copy has to end above them rather than
  // scroll underneath and disappear.
  const foot = await p.evaluate(() => {
    const f = document.querySelector(".dx-foot");
    const kids = [...document.getElementById("screen").children].filter((e) => e !== f);
    const last = kids[kids.length - 1];
    return { fixed: getComputedStyle(f).position === "fixed",
             clears: last.getBoundingClientRect().bottom <= f.getBoundingClientRect().top + 1 };
  });
  if (!foot.fixed) throw new Error("step buttons are not pinned");
  if (!foot.clears) throw new Error("step copy runs under the buttons");
  // The footer sits on the home indicator, it does not stack a design padding
  // on top of it. Twice now that has been added instead of maxed, which floats
  // the buttons up the screen. Asserted on the rule, not on a pixel count, so
  // it holds on a headless viewport that has no inset at all.
  const pad = await p.evaluate(() => {
    const f = document.querySelector(".dx-foot");
    const inset = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue("--safe-bottom")) || 0;
    return { bottom: parseFloat(getComputedStyle(f).paddingBottom), want: Math.max(14, inset) };
  });
  if (pad.bottom > pad.want + 1) {
    throw new Error(`footer padding ${pad.bottom}px, expected max(14, inset) = ${pad.want}px`);
  }
  await p.evaluate(() => document.querySelector(".dx-foot .cta").click());
  await new Promise((r) => setTimeout(r, 700));
  await need(p, ".rw-disc", "the reward");
});

await screen("shop", async (p) => {
  await p.evaluate(() => [...document.querySelectorAll(".tab")]
    .find((t) => /Shop/.test(t.textContent)).click());
  await new Promise((r) => setTimeout(r, 600));
  // The canvas lists the picks rather than making you pick a category first.
  await need(p, ".plist .prow", "pick rows");
  await need(p, ".shop-search input", "shop search");
  await p.evaluate(() => document.querySelector(".plist .prow").click());
  await new Promise((r) => setTimeout(r, 700));
  await need(p, ".verdict-brand", "product verdict");
});

await screen("shop search", async (p) => {
  await p.evaluate(() => [...document.querySelectorAll(".tab")]
    .find((t) => /Shop/.test(t.textContent)).click());
  await new Promise((r) => setTimeout(r, 600));
  await fill(p, ".shop-search input", 0, "glass");
  await new Promise((r) => setTimeout(r, 500));
  await need(p, ".pcard", "search results");
});

await screen("about", async (p) => {
  await tap(p, "#info");
  await new Promise((r) => setTimeout(r, 400));
  await need(p, ".card", "about cards");
});

// The Safari setup screen was removed with the extension target: the extension
// was not working on device, so it came out rather than shipping broken. The
// About screen it opened from is still here and still worth walking.
await screen("about", async (p) => {
  await tap(p, "#info");
  await new Promise((r) => setTimeout(r, 300));
  await need(p, ".card", "about card");
});

await browser.close();
stop();

if (errors.length) {
  console.error("\nsmoke FAILED\n" + errors.map((e) => "  " + e).join("\n"));
  process.exit(1);
}
console.log("smoke: every screen rendered clean");
