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
    props: { ...(props || {}), bundle, platform: window.Capacitor ? window.Capacitor.getPlatform() : "web" },
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

/**
 * Crashes, for an app that almost never crashes the way a native app does.
 *
 * The screens are web, so the realistic failure is an uncaught exception that
 * blanks a view while the process keeps running perfectly happily. Apple's
 * crash reporting never sees one of those, and the catch blocks scattered
 * through the app swallow most of the rest, so a broken screen on someone's
 * phone used to be invisible. These two listeners are the whole of it: no SDK,
 * no third party, nothing new in the bundle, and it ships over the air like
 * any other change.
 */
const MAX_ERRORS = 8;
let errorsSent = 0;
const seenFaults = new Set();
let context = {};

/** Where the app was when it broke. Set from go(), the one navigation point. */
export function setContext(o) { context = o || {}; }

/**
 * The top frames only, with the bundle's own path prefix dropped as noise.
 *
 * Mixpanel truncates any string property at 255 characters, silently, so the
 * budget is spent rather than allocated: the "Error: ..." header line is
 * dropped because `message` already carries it, and only the frames nearest
 * the fault are kept, those being the ones that name the bug.
 */
const STACK_MAX = 250;
function trimStack(s) {
  if (!s) return "";
  const frames = String(s).split("\n")
    .map((l) => l.trim().replace(/https?:\/\/[^)\s]*\/js\//g, ""))
    .filter((l) => l.startsWith("at "));
  return (frames.length ? frames : [String(s).trim()])
    .slice(0, 5)
    .join(" | ")
    .slice(0, STACK_MAX);
}

function shortSource(u) {
  return String(u || "").replace(/^.*\/js\//, "").slice(0, 80);
}

function report(kind, message, extra) {
  try {
    const msg = String(message == null ? "" : message).slice(0, 300);
    if (!msg) return;
    // One report per distinct fault per run, and a ceiling on top of that. A
    // render loop that throws on every frame must not spend the entire
    // Mixpanel quota describing itself.
    const sig = `${kind}|${msg}|${(extra && extra.line) || ""}`;
    if (seenFaults.has(sig) || errorsSent >= MAX_ERRORS) return;
    seenFaults.add(sig);
    errorsSent++;
    track("app_error", { kind, message: msg, screen: context.screen || "", ...(extra || {}) });
    // Sent now rather than on the 4 second timer: whatever just broke may be
    // about to take the rest of the app down with it.
    flush();
  } catch {
    // Reporting a fault must never raise one.
  }
}

window.addEventListener("error", (e) => {
  // The same event also fires for an <img> or <script> that failed to load,
  // where there is no exception to read and the target is the element.
  const target = e && e.target;
  if (target && target !== window && target.src) {
    report("resource", `failed to load ${String(target.src).slice(0, 200)}`, {});
    return;
  }
  const err = e && e.error;
  report("error", (err && err.message) || (e && e.message), {
    stack: trimStack(err && err.stack),
    source: shortSource(e && e.filename),
    line: (e && e.lineno) || 0,
  });
}, true);

window.addEventListener("unhandledrejection", (e) => {
  const reason = e && e.reason;
  report("rejection", (reason && reason.message) || reason, {
    stack: trimStack(reason && reason.stack),
  });
});
