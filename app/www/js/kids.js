/**
 * The Kids room: buying it, proving it, and reading it.
 *
 * The swaps are not in this bundle. Bundles are served from a public URL, so
 * anything shipped inside one is a single unzip away from anybody who finds
 * the link. They live in the worker and arrive only against a pass.
 *
 * Two ways to buy. The web link is the one offered first: Stripe collects an
 * email, which is how the rest of the business reaches people, and Apple takes
 * nothing. The in app purchase is offered as well, because guideline 3.1.3(b)
 * requires it once the app unlocks anything bought elsewhere.
 */
const WORKER = "https://plasticdetox-quiz-email.plasticdetox.workers.dev";
const PASS_KEY = "pd.kids.pass.v1";
const PLAN_KEY = "pd.kids.plan.v1";
const PRODUCT = "org.plasticdetox.app.baby";
const BUY_URL = "https://plasticdetox.org/babies-kids.html?from=app";

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

export function buyUrl() { return BUY_URL; }

function purchases() {
  const cap = window.Capacitor;
  return (cap && cap.Plugins && cap.Plugins.NativePurchases) || null;
}

export function canBuyInApp() { return !!purchases(); }

/** Redeem a StoreKit transaction with the worker, which checks Apple's signature. */
async function redeem(jws) {
  const r = await fetch(`${WORKER}/kids-verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jws }),
  });
  const d = await r.json().catch(() => ({}));
  if (!d || !d.ok || !d.pass) return false;
  setPass(d.pass);
  await load();
  return true;
}

export async function buyInApp() {
  const p = purchases();
  if (!p) return "unavailable";
  try {
    const t = await p.purchaseProduct({ productIdentifier: PRODUCT, productType: "inapp" });
    const jws = (t && (t.jwsRepresentation || t.transactionReceipt || t.receipt)) || "";
    if (!jws) return "failed";
    return (await redeem(jws)) ? "ok" : "failed";
  } catch (e) {
    // A cancelled purchase is a normal outcome, not an error to shout about.
    return /cancel/i.test(String((e && e.message) || e)) ? "cancelled" : "failed";
  }
}

/**
 * Restore. Apple requires this for a non consumable, and it is the whole
 * account system: the Apple ID is the login, so a new phone needs no email,
 * no password and nothing typed.
 */
export async function restore() {
  const p = purchases();
  if (!p) return "unavailable";
  try {
    await p.restorePurchases();
    const owned = await p.getProduct({ productIdentifier: PRODUCT }).catch(() => null);
    const jws = owned && (owned.jwsRepresentation || owned.transactionReceipt);
    if (jws && await redeem(jws)) return "ok";
    return "none";
  } catch {
    return "failed";
  }
}
