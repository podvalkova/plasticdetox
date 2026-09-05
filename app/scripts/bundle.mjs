// Cut an over the air release.
//
// The output goes straight into the site, at app/bundles/ and app/updates.json,
// because the site is this repo. So shipping a fix is: run this, commit, push.
// The worker reads updates.json and tells each install whether to swap.
//
// What can ship this way: screens, copy, matching logic, the verdict data.
// What cannot: the Swift in ios/App/App/Plugins, anything needing a new
// permission, and the Safari extension. Those need an App Store release.
//
//     node scripts/bundle.mjs 1.0.1

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const APP = path.resolve(import.meta.dirname, "..");
const WWW = path.join(APP, "www");
const BUNDLES = path.join(APP, "bundles");
const MANIFEST = path.join(APP, "updates.json");
const KEEP = 3;

const pkg = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8"));
const version = process.argv[2] || pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`version must look like 1.2.3, got "${version}"`);
  process.exit(1);
}

// A release may only go forwards.
//
// package.json still said 1.0.0 while the live manifest was on 1.0.9, so
// running this with no argument wrote latest: 1.0.0, then pruned the very
// bundle it had just built because KEEP only holds the newest three. The
// manifest was left pointing every install at a version absent from its own
// bundle list. Nothing catches that downstream, so it is caught here.
const asNum = (v) => v.split(".").map(Number);
const newer = (a, b) => {
  const [x, y, z] = asNum(a), [p, q, r] = asNum(b);
  return x !== p ? x > p : y !== q ? y > q : z > r;
};
if (fs.existsSync(MANIFEST)) {
  const live = JSON.parse(fs.readFileSync(MANIFEST, "utf8")).latest;
  if (live && !newer(version, live)) {
    console.error(`refusing to release ${version}: the manifest is already on ${live}.`);
    console.error(`pass a higher version, for example: node scripts/bundle.mjs ${
      (([x, y, z]) => [x, y, z + 1].join("."))(asNum(live))}`);
    process.exit(1);
  }
}

// A bundle without data is a bundle that boots to an empty database.
for (const required of ["index.html", "js/main.js", "data/brand-data.json"]) {
  if (!fs.existsSync(path.join(WWW, required))) {
    console.error(`www/${required} is missing. Run npm run sync-data first.`);
    process.exit(1);
  }
}

fs.mkdirSync(BUNDLES, { recursive: true });
const name = `bundle-${version}.zip`;
const zip = path.join(BUNDLES, name);
fs.rmSync(zip, { force: true });

// Zipped from inside www so the archive holds index.html and js/ at its root,
// which is what the updater unpacks over the running bundle.
// Files starting with _ are dev tools that live in www so they can import the
// app's own modules (the render harness). They never ship.
execFileSync("zip", ["-qr", zip, ".", "-x", ".DS_Store", "-x", "__MACOSX/*", "-x", "_*"], { cwd: WWW });

const body = fs.readFileSync(zip);
const checksum = crypto.createHash("sha256").update(body).digest("hex");

const manifest = fs.existsSync(MANIFEST)
  ? JSON.parse(fs.readFileSync(MANIFEST, "utf8"))
  : { latest: null, bundles: {} };

manifest.latest = version;
manifest.bundles[version] = {
  version,
  url: `https://plasticdetox.org/app/bundles/${name}`,
  checksum,
  size: body.length,
  built: new Date().toISOString(),
};

// Old bundles are dead weight in a git repo. An install that fails to unpack
// falls back to the copy compiled into the binary, not to an older download,
// so there is nothing to roll back to and nothing to keep.
const versions = Object.keys(manifest.bundles).sort(compare);
for (const old of versions.slice(0, Math.max(0, versions.length - KEEP))) {
  const stale = path.join(BUNDLES, path.basename(manifest.bundles[old].url));
  fs.rmSync(stale, { force: true });
  delete manifest.bundles[old];
  console.log(`pruned ${old}`);
}

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

console.log(`${name}  ${(body.length / 1024).toFixed(0)} KB`);
console.log(`sha256 ${checksum}`);
console.log(`\nCommit app/bundles/${name} and app/updates.json, push, and the`);
console.log(`next cold start on every install picks it up.`);

function compare(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}
