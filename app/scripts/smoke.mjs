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
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });

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
    await page.evaluate(() => localStorage.setItem("pd.recents.v1", JSON.stringify([
      { id: "brita", name: "Brita", sub: "Water filter", stance: "skip" },
      { id: "stanley", name: "Stanley", sub: "Coolers", stance: "good" },
    ])));
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

const need = async (page, sel, what) => {
  const found = await page.$(sel);
  if (!found) throw new Error(`missing ${what} (${sel})`);
};

await screen("home", async (p) => {
  await need(p, ".check-form", "check form");
  const fields = await p.$$(".field input");
  if (fields.length !== 2) throw new Error(`expected 2 fields, got ${fields.length}`);
  await need(p, ".chip", "recent chip");
  await need(p, ".row-quiet", "all categories row");
});

await screen("known product", async (p) => {
  const f = await p.$$(".field input");
  await f[0].type("Brita");
  await f[1].type("Elite");
  await p.click(".check-form .cta");
  await new Promise((r) => setTimeout(r, 700));
  await need(p, ".verdict-brand", "verdict");
  await need(p, ".front", "front rows");
});

await screen("unknown product", async (p) => {
  const f = await p.$$(".field input");
  await f[0].type("Kelloggs");
  await f[1].type("Corn Flakes");
  await p.click(".check-form .cta");
  await new Promise((r) => setTimeout(r, 700));
  await need(p, ".badge", "not reviewed badge");
  const ctas = await p.$$eval(".card .cta", (ns) => ns.map((n) => n.textContent.trim()));
  for (const want of ["Get checks", "Request free review"]) {
    if (!ctas.some((t) => t.includes(want))) throw new Error(`missing "${want}"`);
  }
});

await screen("categories", async (p) => {
  await p.evaluate(() => [...document.querySelectorAll(".row")]
    .find((r) => r.textContent.includes("All categories")).click());
  await new Promise((r) => setTimeout(r, 400));
  await need(p, ".row-name", "category rows");
});

await screen("about", async (p) => {
  await p.click("#info");
  await new Promise((r) => setTimeout(r, 400));
  await need(p, ".card", "about cards");
});

await screen("safari setup", async (p) => {
  await p.click("#info");
  await new Promise((r) => setTimeout(r, 300));
  await p.evaluate(() => [...document.querySelectorAll(".cta")]
    .find((b) => /turn it on/i.test(b.textContent)).click());
  await new Promise((r) => setTimeout(r, 300));
  await need(p, ".steps", "setup steps");
});

await browser.close();
stop();

if (errors.length) {
  console.error("\nsmoke FAILED\n" + errors.map((e) => "  " + e).join("\n"));
  process.exit(1);
}
console.log("smoke: every screen rendered clean");
