/**
 * The Kids room: buying it, proving it, and reading it.
 *
 * The swaps are not in this bundle. Bundles are served from a public URL, so
 * anything shipped inside one is a single unzip away from anybody who finds
 * the link. They live in the worker and arrive only against a pass.
 *
 * Sold in the app only, at its own price. The website package is a different,
 * larger product at its own price and unlocking one from the other would make
 * both confusing, so nothing here reads a web purchase. That also keeps this a
 * plain in app purchase: 3.1.3(b) only bites when an app unlocks something
 * acquired elsewhere, and this never does.
 */
const WORKER = "https://plasticdetox-quiz-email.plasticdetox.workers.dev";
const PASS_KEY = "pd.kids.pass.v1";
const PLAN_KEY = "pd.kids.plan.v1";
const PRODUCT = "org.plasticdetox.app.baby";

/**
 * Whether the room is offered at all.
 *
 * Off for the first submission. The purchase is built and works, but the App
 * Store product does not exist until the app itself is approved, and a review
 * that taps a buy button which cannot reach a product is a rejection. Turn it
 * on for the second upload, once the product is Ready to Submit and the Stripe
 * link agrees on the price.
 */
export const OFFERED = true;

let phase = null;

export function getPass() {
  try { return localStorage.getItem(PASS_KEY) || ""; } catch { return ""; }
}

export function setPass(token) {
  const clean = String(token || "").trim();
  try {
    if (clean) localStorage.setItem(PASS_KEY, clean);
    else localStorage.removeItem(PASS_KEY);
  } catch {
    // A pass we cannot store still works for this session.
  }
  return clean;
}

export function unlocked() { return !!getPass(); }

/** The room, once it has been paid for. Cached so it opens offline after that. */
export function phaseIfAny() {
  if (phase) return phase;
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    if (raw) phase = JSON.parse(raw);
  } catch {
    phase = null;
  }
  return phase;
}

/**
 * Fetch the swaps. A pass the worker no longer honours clears itself, so a
 * refunded purchase does not leave a room that half works.
 */
export async function load() {
  const pass = getPass();
  if (!pass) return null;
  try {
    const r = await fetch(`${WORKER}/kids-plan?pass=${encodeURIComponent(pass)}`);
    const d = await r.json();
    if (!d || !d.ok || !d.phase) {
      if (r.status === 403) { setPass(""); phase = null; try { localStorage.removeItem(PLAN_KEY); } catch {} }
      return phaseIfAny();
    }
    phase = d.phase;
    try { localStorage.setItem(PLAN_KEY, JSON.stringify(phase)); } catch {}
    return phase;
  } catch {
    // Offline is not the same as unpaid.
    return phaseIfAny();
  }
}

function purchases() {
  const cap = window.Capacitor;
  return (cap && cap.Plugins && cap.Plugins.NativePurchases) || null;
}

export function canBuyInApp() { return !!purchases(); }

/** Which store this device buys from: "play" on Android, "apple" elsewhere. */
function store() {
  const cap = window.Capacitor;
  return cap && cap.getPlatform && cap.getPlatform() === "android" ? "play" : "apple";
}

export function storeName() { return store() === "play" ? "Google Play" : "the App Store"; }
export function accountName() { return store() === "play" ? "Google account" : "Apple ID"; }

/**
 * The price Apple will actually charge, in the reader's own currency.
 *
 * The button used to say $5 because that is what it costs in the States, which
 * is wrong for everyone else: the price is set once and Apple converts it per
 * territory. Asking StoreKit means the button and the sheet that opens from it
 * agree, wherever someone is.
 */
export async function price() {
  const p = purchases();
  if (!p) return "";
  try {
    const r = await p.getProduct({ productIdentifier: PRODUCT });
    const one = (r && (r.product || r)) || {};
    return one.priceString || one.displayPrice || "";
  } catch {
    return "";
  }
}

/**
 * Redeem a purchase with the worker: Apple's signed transaction, or the Play
 * purchase token, whichever this device produces. The worker checks it with
 * the store it came from.
 */
async function redeem(proof) {
  const r = await fetch(`${WORKER}/kids-verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(proof),
  });
  const d = await r.json().catch(() => ({}));
  if (!d || !d.ok || !d.pass) return false;
  setPass(d.pass);
  await load();
  return true;
}

function proofFrom(t) {
  if (store() === "play") {
    const token = (t && t.purchaseToken) || "";
    return token ? { store: "play", purchaseToken: token } : null;
  }
  const jws = (t && (t.jwsRepresentation || t.transactionReceipt || t.receipt)) || "";
  return jws ? { jws } : null;
}

export async function buyInApp() {
  const p = purchases();
  if (!p) return "unavailable";
  try {
    const t = await p.purchaseProduct({ productIdentifier: PRODUCT, productType: "inapp" });
    const proof = proofFrom(t);
    if (!proof) return "failed";
    return (await redeem(proof)) ? "ok" : "failed";
  } catch (e) {
    // A cancelled purchase is a normal outcome, not an error to shout about.
    return /cancel/i.test(String((e && e.message) || e)) ? "cancelled" : "failed";
  }
}

/**
 * Restore. Both stores require this for a non consumable, and it is the whole
 * account system: the store account is the login, so a new phone needs no
 * email, no password and nothing typed.
 */
export async function restore() {
  const p = purchases();
  if (!p) return "unavailable";
  try {
    if (store() === "play") {
      const r = await p.getPurchases({ productType: "inapp" }).catch(() => null);
      const owned = ((r && r.purchases) || []).find(
        (t) => (t.productIdentifier || t.productId) === PRODUCT && t.purchaseToken);
      const proof = owned && proofFrom(owned);
      if (proof && await redeem(proof)) return "ok";
      return "none";
    }
    await p.restorePurchases();
    const owned = await p.getProduct({ productIdentifier: PRODUCT }).catch(() => null);
    const jws = owned && (owned.jwsRepresentation || owned.transactionReceipt);
    if (jws && await redeem({ jws })) return "ok";
    return "none";
  } catch {
    return "failed";
  }
}
