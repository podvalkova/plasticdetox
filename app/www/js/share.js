/**
 * Handing a verdict to somebody else.
 *
 * The link goes to the same verdict on plasticdetox.org rather than to a shop:
 * whoever receives it has no app, and a person who has just been told their
 * pan is a problem wants the reasoning, not a checkout. It is also the only
 * link we are allowed to send, since a tagged retailer link inside an app is
 * outside what the Associates agreement covers.
 */
import { verdictCard } from "./card.js";

const SITE = "https://plasticdetox.org";

function plugin() {
  const cap = window.Capacitor;
  return (cap && cap.Plugins && cap.Plugins.Share) || null;
}

function files() {
  const cap = window.Capacitor;
  return (cap && cap.Plugins && cap.Plugins.Filesystem) || null;
}

/**
 * The card, written where the share sheet can reach it.
 *
 * A data URL cannot be shared: the sheet hands other apps a file, so the
 * picture has to exist as one. The cache directory is the right home, since
 * the system clears it and nobody needs yesterday's card.
 */
async function cardFile(v) {
  const fs = files();
  if (!fs || !fs.writeFile) return "";
  try {
    const data = verdictCard(v).split(",")[1];
    const name = `verdict-${Date.now()}.png`;
    const w = await fs.writeFile({ path: name, data, directory: "CACHE" });
    return (w && w.uri) || "";
  } catch {
    // A card we could not draw or write is not worth losing the share over.
    return "";
  }
}

/** The web's own share sheet exists in Safari but not in an Android webview. */
export function available() {
  return !!plugin() || (typeof navigator !== "undefined" && typeof navigator.share === "function");
}

/**
 * Where a shared verdict lands.
 *
 * The same verdict on the site, which carries the App Store button at the top
 * of its own page, so the link reads as something worth opening and still ends
 * at the download. A bare store link would arrive with nothing to say and
 * would be a dead end for anybody on Android until Play is public. ct= is how
 * Apple reports which link the install came from.
 */
export function brandUrl(brand) {
  return `${SITE}/brand-check.html?b=${encodeURIComponent(brand)}&ct=share`;
}

/** Returns "ok", "cancelled", "failed" or "unavailable". Cancelling is normal. */
export async function verdict({ name, line, url, card }) {
  const p = plugin();
  try {
    if (p) {
      // The picture where a phone can make one, the words either way. An app
      // that takes only one of them takes the picture, which is the point.
      const file = card ? await cardFile(card) : "";
      await p.share(Object.assign(
        { title: name, text: line, url, dialogTitle: "Share this verdict" },
        file ? { files: [file] } : {}));
      return "ok";
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: name, text: line, url });
      return "ok";
    }
  } catch (e) {
    const why = String((e && (e.message || e.errorMessage)) || e);
    return /cancel|abort|dismiss/i.test(why) ? "cancelled" : "failed";
  }
  return "unavailable";
}
