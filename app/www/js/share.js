/**
 * Handing a verdict to somebody else.
 *
 * The link goes to the same verdict on plasticdetox.org rather than to a shop:
 * whoever receives it has no app, and a person who has just been told their
 * pan is a problem wants the reasoning, not a checkout. It is also the only
 * link we are allowed to send, since a tagged retailer link inside an app is
 * outside what the Associates agreement covers.
 */
const SITE = "https://plasticdetox.org";

function plugin() {
  const cap = window.Capacitor;
  return (cap && cap.Plugins && cap.Plugins.Share) || null;
}

/** The web's own share sheet exists in Safari but not in an Android webview. */
export function available() {
  return !!plugin() || (typeof navigator !== "undefined" && typeof navigator.share === "function");
}

export function brandUrl(brand) {
  return `${SITE}/brand-check.html?b=${encodeURIComponent(brand)}`;
}

/** Returns "ok", "cancelled", "failed" or "unavailable". Cancelling is normal. */
export async function verdict({ name, line, url }) {
  const p = plugin();
  try {
    if (p) {
      await p.share({ title: name, text: line, url, dialogTitle: "Share this verdict" });
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
