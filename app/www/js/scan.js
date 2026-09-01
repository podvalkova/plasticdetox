// The camera, behind one function.
//
// Three implementations sit behind `scan()`, picked at runtime:
//
//   native   our own AVFoundation plugin, in ios/App/App/Plugins
//   web      Chrome's BarcodeDetector, so the app is testable in a browser
//   none     no camera available, and the caller falls back to search
//
// Native plugins are reached through the Capacitor bridge on `window` rather
// than imported. That is deliberate: it means this bundle is plain files with
// no build step, which is what makes an over the air update a file copy.

let impl = null;
let nativeSupported = null;

function plugin(name) {
  const cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return null;
  return (cap.Plugins && cap.Plugins[name]) || null;
}

function detect() {
  if (impl) return impl;
  if (plugin("BarcodeScanner")) impl = "native";
  else impl = "BarcodeDetector" in window ? "web" : "none";
  return impl;
}

/**
 * Can we scan at all?
 *
 * On a simulator the plugin is present and the camera is not, so the answer
 * has to come from the device rather than from whether the bridge exists.
 */
export async function available() {
  const kind = detect();
  if (kind === "none") return false;
  if (kind !== "native") return true;
  if (nativeSupported === null) {
    try {
      const { supported } = await plugin("BarcodeScanner").isSupported();
      nativeSupported = !!supported;
    } catch {
      nativeSupported = false;
    }
  }
  return nativeSupported;
}

/**
 * Why scanning is off, told apart rather than lumped together.
 *
 * "No scanner in this build" and "no camera on this device" look identical to
 * someone holding a phone, and the first one is a bug. It shipped once: the
 * plugin was never registered, every device reported no camera, and the app
 * looked like it had simply chosen not to have a scanner.
 */
export function unavailableReason() {
  const cap = window.Capacitor;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  if (native && !plugin("BarcodeScanner")) return "missing-plugin";
  if (native) return "no-camera";
  return "web";
}

/** Ask for the camera. Returns true when we may scan. */
export async function permit() {
  if (detect() !== "native") return true;
  const bs = plugin("BarcodeScanner");
  const { camera } = await bs.checkPermissions();
  if (camera === "granted" || camera === "limited") return true;
  const asked = await bs.requestPermissions();
  return asked.camera === "granted" || asked.camera === "limited";
}

/**
 * Scan one barcode and return its digits, or null if the user backed out.
 *
 * Only the symbologies a retail product actually carries are enabled. Letting
 * QR codes through means scanning a packaging recycling QR resolves to a URL
 * we cannot look up, which reads as a broken scanner.
 */
export async function scan() {
  const kind = detect();
  if (kind === "native") return scanNative();
  if (kind === "web") return scanWeb();
  return null;
}

async function scanNative() {
  // An empty list is how the plugin reports a cancel, which is not an error.
  const { barcodes } = await plugin("BarcodeScanner").scan();
  if (!barcodes || !barcodes.length) return null;
  return barcodes[0].rawValue || null;
}

/**
 * The browser path, used for development on a desktop.
 *
 * Deliberately plain: a video element, a detection loop, and a stop button.
 * Nothing here ships as the primary experience, so it optimises for being easy
 * to reason about rather than for low light performance.
 */
async function scanWeb() {
  const detector = new window.BarcodeDetector({
    formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "itf"],
  });
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
  });

  const shade = document.createElement("div");
  shade.className = "scan-shade";
  const video = document.createElement("video");
  video.setAttribute("playsinline", "");
  video.autoplay = true;
  video.muted = true;
  video.srcObject = stream;
  const frame = document.createElement("div");
  frame.className = "scan-frame";
  const cancel = document.createElement("button");
  cancel.className = "scan-cancel";
  cancel.textContent = "Cancel";
  shade.append(video, frame, cancel);
  document.body.appendChild(shade);

  const close = () => {
    stream.getTracks().forEach((t) => t.stop());
    shade.remove();
  };

  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      close();
      resolve(value);
    };
    cancel.onclick = () => finish(null);
    const tick = async () => {
      if (done) return;
      try {
        const found = await detector.detect(video);
        if (found.length) return finish(found[0].rawValue);
      } catch {
        // A frame that fails to decode is the normal case, not an error.
      }
      requestAnimationFrame(tick);
    };
    video.onloadedmetadata = () => { video.play(); tick(); };
  });
}
