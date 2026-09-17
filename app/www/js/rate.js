/**
 * Asking for a rating, the way both stores insist it is done.
 *
 * Neither store lets an app run its own star prompt. Apple's rule is that the
 * request goes through StoreKit, which decides whether to show anything at
 * all; Google says the same and adds that the request must never hang off a
 * button. So this is a request, not a dialog: it may show nothing, and there
 * is no way to know which happened, which is by design on both sides.
 *
 * Because we cannot see the outcome, the restraint has to be ours. It asks
 * only after somebody has finished a few swaps, which is the point where the
 * app has done something for them, and then not again for months.
 */
const ASKED_KEY = "pd.rated.v1";
const APPLE_ID = "6807191826";
const MIN_DONE = 3;
const COOLDOWN_DAYS = 120;

function plugin() {
  const cap = window.Capacitor;
  return (cap && cap.Plugins && cap.Plugins.InAppReview) || null;
}

function asked() {
  try { return JSON.parse(localStorage.getItem(ASKED_KEY) || "null") || {}; } catch { return {}; }
}

function remember() {
  try { localStorage.setItem(ASKED_KEY, JSON.stringify({ at: Date.now() })); } catch {}
}

/**
 * Ask, if the moment has earned it. Answers whether we asked, which is not
 * the same as whether anything appeared.
 */
export async function maybeAsk(done) {
  const p = plugin();
  if (!p || !p.requestReview) return false;
  if (!(done >= MIN_DONE)) return false;
  const last = asked().at || 0;
  if (last && Date.now() - last < COOLDOWN_DAYS * 24 * 60 * 60 * 1000) return false;
  try {
    await p.requestReview();
  } catch {
    // A store that will not take the request today is not an error worth
    // showing, and it must not burn the cooldown either.
    return false;
  }
  remember();
  return true;
}

/**
 * The listing, for somebody who goes looking rather than waiting to be asked.
 * Apple takes a parameter that opens the review sheet directly; Play opens the
 * listing, where the stars are the first thing on the page.
 */
export function storeUrl() {
  const cap = window.Capacitor;
  const android = cap && cap.getPlatform && cap.getPlatform() === "android";
  return android
    ? "https://play.google.com/store/apps/details?id=org.plasticdetox.app"
    : `https://apps.apple.com/app/id${APPLE_ID}?action=write-review`;
}
