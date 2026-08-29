// The camera, behind one function.
//
// Three implementations sit behind `scan()`, picked at runtime:
//
//   native   the ML Kit scanner, which reads a barcode off a shelf at an
//            angle, in bad light, through shrink wrap
//   web      Chrome's BarcodeDetector, so the app is testable in a browser
//   none     no camera available, and the caller falls back to search
//
// Native plugins are reached through the Capacitor bridge on `window` rather
// than imported. That is deliberate: it means this bundle is plain files with
// no build step, which is what makes an over the air update a file copy.

const FORMATS = ["EAN_13", "EAN_8", "UPC_A", "UPC_E", "CODE_128", "ITF"];

let impl = null;

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

export function available() {
  return detect() !== "none";
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
  const bs = plugin("BarcodeScanner");

  // The scanner module is not in the app binary. On a first scan it downloads,
  // which takes a moment on a shop's wifi, so we check before opening a camera
  // that would otherwise sit there finding nothing.
  try {
    const ready = await bs.isGoogleBarcodeScannerModuleAvailable();
    if (ready && ready.available === false) {
      await bs.installGoogleBarcodeScannerModule();
    }
  } catch {
    // Not every platform exposes the module check. Scanning still works.
  }

  const { barcodes } = await bs.scan({ formats: FORMATS });
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
