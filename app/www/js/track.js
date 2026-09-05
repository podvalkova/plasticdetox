/**
 * App events, forwarded through our own worker rather than an SDK.
 *
 * The device talks only to plasticdetox.org, as it already does for everything
 * else. The worker holds the Mixpanel token and does the forwarding, so there
 * is no third party script on the phone, no extra dependency in the bundle,
 * and the whole thing ships over the air instead of needing a native build.
 *
 * Nothing here identifies a person. The id is a random string this install
 * made up for itself, so events from one phone group together and nothing
 * more.
 */
const WORKER = "https://plasticdetox-quiz-email.plasticdetox.workers.dev";
const WHO_KEY = "pd.notify.who.v1";

let queue = [];
let timer = null;
let bundle = "";

/** The same anonymous id the notification counters already use. */
export function who() {
  try {
    let id = localStorage.getItem(WHO_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(WHO_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

/** Which bundle produced the event, so a regression can be dated. */
export function setBundle(v) { bundle = String(v || ""); }

/**
 * Batched, because a tap that fires a request competes with the screen it is
 * trying to open. Flushed on a short timer and again when the app is hidden,
 * with keepalive so the last batch survives the app going away.
 */
export function track(event, props) {
  if (!event) return;
  queue.push({
    event,
    props: { ...(props || {}), bundle, platform: window.Capacitor ? "ios" : "web" },
    at: Date.now(),
  });
  if (queue.length >= 12) return flush();
  if (!timer) timer = setTimeout(flush, 4000);
}

export function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  const batch = queue;
  queue = [];
  try {
    fetch(`${WORKER}/mp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: who(), events: batch }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics must never be able to break the app.
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flush();
});
