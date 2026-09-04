// Build the Android release, the same way scripts/testflight.mjs builds iOS.
//
//   npm run android            bump the build number, assemble a release AAB
//   npm run android 1.0.40     also set the version people see
//
// The version people see must match the bundle version we publish, for the
// same reason it does on iOS: a fresh install reports the native version to
// /app-update, and if that is lower than the manifest it downloads a copy of
// what it already has on first launch.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const APP = path.resolve(import.meta.dirname, "..");
const ANDROID = path.join(APP, "android");
const GRADLE = path.join(ANDROID, "app", "build.gradle");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: APP, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
  return r;
}

// The toolchain is not part of this repo and is easy to be missing. Say so
// plainly rather than failing three minutes later inside Gradle.
const missing = [];
const java = spawnSync("java", ["-version"]);
if (java.error || java.status !== 0) missing.push("a JDK (Temurin 21: brew install --cask temurin@21)");
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  || (fs.existsSync(`${process.env.HOME}/Library/Android/sdk`) ? `${process.env.HOME}/Library/Android/sdk` : "");
if (!sdk) missing.push("the Android SDK (brew install --cask android-commandlinetools, then sdkmanager \"platforms;android-35\" \"build-tools;35.0.0\")");

const version = process.argv[2];
let gradle = fs.readFileSync(GRADLE, "utf8");
const code = Number((gradle.match(/versionCode (\d+)/) || [])[1] || 0) + 1;
gradle = gradle.replace(/versionCode \d+/, `versionCode ${code}`);
if (version) {
  if (!/^\d+\.\d+(\.\d+)?$/.test(version)) {
    console.error(`version must look like 1.0 or 1.0.1, got "${version}"`);
    process.exit(1);
  }
  gradle = gradle.replace(/versionName "[^"]+"/, `versionName "${version}"`);
}
fs.writeFileSync(GRADLE, gradle);
const name = (gradle.match(/versionName "([^"]+)"/) || [])[1];
console.log(`\n==> ${name} (${code})\n`);

// The web layer is the app. Copy it in before anything is compiled.
run("npx", ["cap", "sync", "android"]);

if (missing.length) {
  console.log("\nProject is up to date, but the build tools are not installed:");
  for (const m of missing) console.log(`  - ${m}`);
  console.log("\nInstall those, then run this again. Everything else is ready:");
  console.log("  android/ is a complete Gradle project with the web assets copied in.");
  process.exit(0);
}

const env = { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
run(path.join(ANDROID, "gradlew"), ["bundleRelease"], { cwd: ANDROID, env });
const aab = path.join(ANDROID, "app", "build", "outputs", "bundle", "release", "app-release.aab");
console.log(fs.existsSync(aab)
  ? `\nBuilt ${aab}\nUpload it to the Play Console, then publish the matching OTA bundle.`
  : "\nGradle finished but no AAB was produced. Check the output above.");
