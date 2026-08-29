// Copy the site's live data into the app bundle.
//
// brand-data.json has exactly one home, at the repo root, where the research
// tools write it. The app ships a snapshot of it rather than a second copy
// anyone could edit, so the two can never disagree about a verdict.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = path.resolve(import.meta.dirname, "..");
const REPO = path.resolve(APP, "..");
const OUT = path.join(APP, "www", "data");

const SOURCES = [
  { from: path.join(REPO, "brand-data.json"), to: "brand-data.json" },
  { from: path.join(REPO, "extension", "data", "asin-map.json"), to: "asin-map.json" },
];

fs.mkdirSync(OUT, { recursive: true });

let brands = 0;
for (const { from, to } of SOURCES) {
  if (!fs.existsSync(from)) {
    console.error(`missing source: ${from}`);
    process.exit(1);
  }
  const body = fs.readFileSync(from);
  const parsed = JSON.parse(body);
  if (to === "brand-data.json") {
    if (!Array.isArray(parsed) || parsed.length < 100) {
      console.error(`brand-data.json looks wrong: ${Array.isArray(parsed) ? parsed.length : typeof parsed}`);
      process.exit(1);
    }
    brands = parsed.length;
  }
  fs.writeFileSync(path.join(OUT, to), body);
  console.log(`${to.padEnd(18)} ${(body.length / 1024).toFixed(0)} KB`);
}

// Barcodes we have mapped ourselves. Empty until we start collecting them from
// scans, and kept as its own file so the app can refresh it on its own clock.
const barcodes = path.join(OUT, "barcodes.json");
if (!fs.existsSync(barcodes)) fs.writeFileSync(barcodes, "{}\n");

const stamp = {
  brands,
  built: new Date().toISOString(),
  hash: crypto.createHash("sha256")
    .update(fs.readFileSync(path.join(OUT, "brand-data.json")))
    .digest("hex").slice(0, 12),
};
fs.writeFileSync(path.join(OUT, "version.json"), JSON.stringify(stamp, null, 2) + "\n");
console.log(`synced ${brands} brands, hash ${stamp.hash}`);
