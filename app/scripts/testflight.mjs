// Build and upload a TestFlight build.
//
//     npm run testflight            # next build number
//     npm run testflight 1.0.1      # and set the version people see
//
// Needs three things in the environment, all from App Store Connect under
// Users and Access, Integrations, App Store Connect API:
//
//     PD_TEAM_ID      the ten character Apple Developer team
//     PD_ASC_KEY_ID   the key's id, the part in AuthKey_XXXXXXXXXX.p8
//     PD_ASC_ISSUER   the issuer id, a UUID shown above the key list
//
// and the .p8 itself in ~/.appstoreconnect/private_keys/, which is where
// every Apple tool looks for it without being told.
//
// The upload is the last step and the only irreversible one: a build number
// that reaches App Store Connect can never be used again.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const APP = path.resolve(import.meta.dirname, "..");
const IOS = path.join(APP, "ios", "App");
const OUT = path.join(APP, "dist", "ios");
const ARCHIVE = path.join(OUT, "PlasticDetox.xcarchive");

const TEAM = process.env.PD_TEAM_ID;
const KEY_ID = process.env.PD_ASC_KEY_ID;
const ISSUER = process.env.PD_ASC_ISSUER;

const missing = [
  !TEAM && "PD_TEAM_ID",
  !KEY_ID && "PD_ASC_KEY_ID",
  !ISSUER && "PD_ASC_ISSUER",
].filter(Boolean);
if (missing.length) {
  console.error(`Missing: ${missing.join(", ")}\n`);
  console.error("App Store Connect, Users and Access, Integrations, App Store Connect API.");
  console.error("Then put AuthKey_<KEY_ID>.p8 in ~/.appstoreconnect/private_keys/");
  process.exit(1);
}

const keyPath = path.join(os.homedir(), ".appstoreconnect", "private_keys", `AuthKey_${KEY_ID}.p8`);
if (!fs.existsSync(keyPath)) {
  console.error(`No key at ${keyPath}`);
  process.exit(1);
}

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", cwd: IOS, ...opts });

// The version people see, and the build number, which must never repeat.
const version = process.argv[2];
const pbxproj = path.join(IOS, "App.xcodeproj", "project.pbxproj");
let proj = fs.readFileSync(pbxproj, "utf8");
const current = Number((proj.match(/CURRENT_PROJECT_VERSION = (\d+);/) || [])[1] || 0);
const build = current + 1;
proj = proj.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
if (version) {
  if (!/^\d+\.\d+(\.\d+)?$/.test(version)) {
    console.error(`version must look like 1.0 or 1.0.1, got "${version}"`);
    process.exit(1);
  }
  proj = proj.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
}
fs.writeFileSync(pbxproj, proj);
const marketing = (proj.match(/MARKETING_VERSION = ([^;]+);/) || [])[1];
console.log(`\n==> ${marketing} (${build})\n`);

console.log("==> web bundle");
run("npm", ["run", "sync-data"], { cwd: APP });
run("npx", ["cap", "copy", "ios"], { cwd: APP });

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(ARCHIVE, { recursive: true, force: true });

console.log("\n==> archive");
run("xcodebuild", [
  "-workspace", "App.xcworkspace",
  "-scheme", "App",
  "-configuration", "Release",
  "-sdk", "iphoneos",
  "-archivePath", ARCHIVE,
  "-allowProvisioningUpdates",
  "-authenticationKeyPath", keyPath,
  "-authenticationKeyID", KEY_ID,
  "-authenticationKeyIssuerID", ISSUER,
  `DEVELOPMENT_TEAM=${TEAM}`,
  "archive",
]);

// Both the app and the Safari extension are signed, so both are named here.
const exportOptions = path.join(OUT, "ExportOptions.plist");
fs.writeFileSync(exportOptions, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>${TEAM}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
`);

console.log("\n==> export");
run("xcodebuild", [
  "-exportArchive",
  "-archivePath", ARCHIVE,
  "-exportPath", OUT,
  "-exportOptionsPlist", exportOptions,
  "-allowProvisioningUpdates",
  "-authenticationKeyPath", keyPath,
  "-authenticationKeyID", KEY_ID,
  "-authenticationKeyIssuerID", ISSUER,
]);

const ipa = fs.readdirSync(OUT).find((f) => f.endsWith(".ipa"));
if (!ipa) {
  console.error("No .ipa was produced.");
  process.exit(1);
}

console.log(`\n==> validate ${ipa}`);
run("xcrun", ["altool", "--validate-app", "-f", path.join(OUT, ipa), "-t", "ios",
  "--apiKey", KEY_ID, "--apiIssuer", ISSUER]);

console.log("\n==> upload");
run("xcrun", ["altool", "--upload-app", "-f", path.join(OUT, ipa), "-t", "ios",
  "--apiKey", KEY_ID, "--apiIssuer", ISSUER]);

console.log(`\nUploaded ${marketing} (${build}).`);
console.log("Processing takes a few minutes. Then in App Store Connect, TestFlight,");
console.log("answer the export compliance question and add it to a tester group.");
