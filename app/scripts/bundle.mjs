// Build an over the air bundle.
//
// The output is a zip of www plus a line in updates.json. The app asks the
// worker whether there is a newer version than the one it is running, and the
// worker answers out of that file, so shipping a fix is: bump the version,
// run this, deploy the site.
//
// What can ship this way: screens, copy, matching logic, data. What cannot:
// the Swift in ios/App/App/Plugins, and anything that needs a new permission.
// Those still need an App Store release.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const APP = path.resolve(import.meta.dirname, "..");
const WWW = path.join(APP, "www");
const DIST = path.join(APP, "dist");
const pkg = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8"));

const version = process.argv[2] || pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`version must look like 1.2.3, got "${version}"`);
  process.exit(1);
}

fs.mkdirSync(DIST, { recursive: true });
const name = `bundle-${version}.zip`;
const zip = path.join(DIST, name);
fs.rmSync(zip, { force: true });

// Zipped from inside www so the paths in the archive are index.html and js/,
// which is what the updater expects to unpack over the running bundle.
execFileSync("zip", ["-qr", zip, ".", "-x", ".DS_Store", "-x", "__MACOSX/*"], { cwd: WWW });

const body = fs.readFileSync(zip);
const checksum = crypto.createHash("sha256").update(body).digest("hex");

const manifestPath = path.join(DIST, "updates.json");
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : { latest: null, bundles: {} };

manifest.latest = version;
manifest.bundles[version] = {
  version,
  url: `https://plasticdetox.org/app/bundles/${name}`,
  checksum,
  size: body.length,
  built: new Date().toISOString(),
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(`${name}  ${(body.length / 1024).toFixed(0)} KB`);
console.log(`sha256 ${checksum}`);
console.log(`\nNext: copy dist/${name} to the site at app/bundles/, deploy dist/updates.json`);
console.log(`with the worker, and the next cold start picks it up.`);
