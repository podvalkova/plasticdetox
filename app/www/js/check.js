// The instant check, and the pass that pays for it.
//
// Mirrors what vet.html does on the web: POST a brand and product to /vet with
// a pass token, then read a stream of four front results and a final verdict.
// The pass is a token, not an account, so all that is held here is a string.
//
// Nothing in this file buys anything. Buying happens on the website, and the
// pass comes back to the app either through a deep link or by being pasted.

const WORKER = "https://plasticdetox-quiz-email.plasticdetox.workers.dev";
const SITE = "https://plasticdetox.org";
const PASS_KEY = "pd.pass.v1";

export const STEP_LABEL = {
  formula: "Formula",
  materials: "Materials",
  legal: "Recalls & lawsuits",
  testing: "Independent tests",
};

export function getPass() {
  try {
    return localStorage.getItem(PASS_KEY) || "";
  } catch {
    return "";
  }
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

/** How many checks are left, or null when we cannot say. */
export async function balance() {
  const pass = getPass();
  if (!pass) return null;
  try {
    const r = await fetch(`${WORKER}/vet-balance?pass=${encodeURIComponent(pass)}`);
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d.balance === "number" ? d.balance : null;
  } catch {
    return null;
  }
}

/**
 * Where checks are bought.
 *
 * app=1 tells the website that whoever lands there came from the app, so that
 * after Stripe it offers the pass back through the app's own URL scheme rather
 * than printing a token for somebody to copy. Buying a pass and then having to
 * retype it into the app is the kind of step people simply do not complete.
 */
/**
 * Signing in, so a pass belongs to the person rather than to this phone.
 *
 * The app keeps its pass at capacitor://localhost and the website keeps one at
 * plasticdetox.org. Two origins, so they could never see each other: buying on
 * the site left the app blank, and a new phone lost everything. The token was
 * the only identity there was.
 *
 * A six digit code fixes that where a link cannot, because a link has to cross
 * back into the app through a deep link and a code can just be typed. The same
 * six digits work here and in a browser.
 */
export async function sendCode(email) {
  try {
    const r = await fetch(`${WORKER}/vet-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const d = await r.json();
    // The worker answers the same whether or not the address owns anything, so
    // this cannot be used to find out who has bought.
    return { ok: r.ok, message: d.message || "If that address has a pass, the code is on its way." };
  } catch (e) {
    return { ok: false, message: "Could not reach us just now. Try again in a moment." };
  }
}

/** Trade a code for the pass, and save it. Returns the balance on success. */
export async function signIn(email, code) {
  try {
    const r = await fetch(`${WORKER}/vet-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const d = await r.json();
    if (!d.ok || !d.pass) return { ok: false, error: d.error || "That code is wrong or has expired." };
    setPass(d.pass);
    return { ok: true, balance: d.balance || 0, email: d.email || email };
  } catch (e) {
    return { ok: false, error: "Could not reach us just now. Try again in a moment." };
  }
}

export function buyUrl(brand, product) {
  const q = [brand, product].filter(Boolean).join(" ").trim();
  const params = new URLSearchParams({ app: "1" });
  if (q) params.set("q", q);
  return `${SITE}/vet.html?${params.toString()}`;
}

/**
 * Run a check, reporting each front as it lands.
 *
 * The worker answers with server sent events rather than one JSON body,
 * because a full check takes about a minute and watching the four checks
 * arrive is most of what makes the wait tolerable.
 *
 * `onFront` is called per check, `onDone` once at the end. Errors arrive
 * through onDone too, so a caller only has to handle one ending.
 */
export async function run({ brand, product, url = "", onFront, onDone }) {
  const pass = getPass();
  let res;
  try {
    res = await fetch(`${WORKER}/vet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pass, brand, product, url }),
    });
  } catch {
    onDone({ error: "No connection. Try again in a moment." });
    return;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    onDone({ error: body.error || `The check failed (${res.status}).` });
    return;
  }
  if (!res.body || !res.body.getReader) {
    onDone({ error: "This device cannot stream the check." });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let split;
      // Events are separated by a blank line, and a single read can carry a
      // fragment, several events, or both.
      while ((split = buffer.indexOf("\n\n")) >= 0) {
        const chunk = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        if (!chunk.startsWith("data: ")) continue;
        let event;
        try {
          event = JSON.parse(chunk.slice(6));
        } catch {
          continue;
        }
        if (event.internal) continue;
        if (event.front) onFront(event.step, event.front);
        if (event.done) onDone(event);
      }
    }
  } catch {
    onDone({ error: "The check was interrupted." });
  }
}

/** Ask a person to research it by hand. Free, answered in two business days. */
export async function requestReview({ brand, product, email }) {
  const subject = [brand, product].filter(Boolean).join(" ").trim();
  const res = await fetch(`${WORKER}/brand-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brand: subject, email: String(email || "").trim() }),
  });
  const body = await res.json().catch(() => ({}));
  return !!body.ok;
}
