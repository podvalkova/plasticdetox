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

export function buyUrl(brand, product) {
  const q = [brand, product].filter(Boolean).join(" ").trim();
  return `${SITE}/vet.html${q ? `?q=${encodeURIComponent(q)}` : ""}`;
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
export async function run({ brand, product, onFront, onDone }) {
  const pass = getPass();
  let res;
  try {
    res = await fetch(`${WORKER}/vet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pass, brand, product }),
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
