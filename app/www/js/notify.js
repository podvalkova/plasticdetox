/**
 * The tip of the day, as a notification.
 *
 * Local, not push: the app schedules these on the device itself, so there is
 * no server, no Apple key, no device token and nothing of yours leaves the
 * phone. It also means they keep arriving with no signal.
 *
 * iOS allows 64 pending local notifications per app, so we keep a rolling
 * window well inside that and top it up every time the app opens.
 */
import { tipOfDay, dayOfYear } from "./data.js";

// Absence means on. Provisional authorisation means nobody had to opt in, so
// the only state worth storing is a deliberate refusal.
const OFF_KEY = "pd.notify.off.v1";
const SEEDED_KEY = "pd.notify.seeded.v1";
const HOUR_KEY = "pd.notify.hour.v1";
const WINDOW = 55;
const DEFAULT_HOUR = 8;

function plugin() {
  const cap = window.Capacitor;
  return (cap && cap.Plugins && cap.Plugins.LocalNotifications) || null;
}

/** Notifications are only worth offering where they can actually be delivered. */
export function available() {
  return !!plugin();
}

export function isOn() {
  try { return localStorage.getItem(OFF_KEY) !== "1"; } catch { return true; }
}

export function hour() {
  try { return Number(localStorage.getItem(HOUR_KEY)) || DEFAULT_HOUR; } catch { return DEFAULT_HOUR; }
}

function remember(on) {
  try {
    if (on) localStorage.removeItem(OFF_KEY);
    else localStorage.setItem(OFF_KEY, "1");
  } catch {
    // A phone that will not store the preference still gets this session's.
  }
}

/** Whether iOS will actually deliver, counting the quiet provisional grant. */
async function allowed() {
  const ln = plugin();
  if (!ln) return false;
  try {
    const p = await ln.checkPermissions();
    return p && p.display === "granted";
  } catch {
    return false;
  }
}

/**
 * Start on its own, with no dialog and nothing to tap.
 *
 * AppDelegate asks for provisional authorisation at launch, which iOS grants
 * without asking anyone anything and delivers quietly. So by the time this
 * runs the answer is usually already yes, and the reader gets tomorrow's tip
 * without ever having opted in. The first one goes out within the minute so
 * there is something real in Notification Centre carrying Apple's own Keep and
 * Turn Off buttons, which is the decision that actually matters.
 */
export async function autoStart() {
  if (!isOn()) return 0;
  if (!(await allowed())) return 0;
  const n = await reschedule();
  let seeded = true;
  try { seeded = localStorage.getItem(SEEDED_KEY) === "1"; } catch { /* treat as seeded */ }
  if (!seeded) {
    try { localStorage.setItem(SEEDED_KEY, "1"); } catch { /* not worth failing over */ }
    await sendSample(45);
  }
  return n;
}

/**
 * Ask, then schedule. Returns what actually happened, because a refusal is a
 * normal answer and the screen has to say something true about it.
 */
export async function turnOn() {
  const ln = plugin();
  if (!ln) return "unavailable";
  remember(true);
  if (await allowed()) {
    await reschedule();
    return "on";
  }
  // Only reached if the quiet grant was refused or revoked in Settings.
  try {
    const asked = await ln.requestPermissions();
    if (!asked || asked.display !== "granted") return "denied";
  } catch {
    return "unavailable";
  }
  await reschedule();
  return "on";
}

export async function turnOff() {
  remember(false);
  const ln = plugin();
  if (!ln) return;
  try {
    const pending = await ln.getPending();
    const ours = (pending.notifications || []).filter((n) => n.id >= 10000 && n.id < 20000);
    if (ours.length) await ln.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  } catch {
    // Nothing pending is the same outcome as cancelling it.
  }
}

/**
 * Lay down the next WINDOW days, each carrying that day's actual tip.
 *
 * Ids are 10000 + day of year, so rescheduling replaces a day rather than
 * stacking a second copy of it, and cancelling only touches ours.
 */
export async function reschedule() {
  const ln = plugin();
  if (!ln || !isOn()) return 0;
  const at = hour();
  const now = new Date();
  const list = [];
  for (let i = 0; i < WINDOW; i++) {
    const when = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, at, 0, 0, 0);
    if (when <= now) continue;
    const tip = tipOfDay(when);
    if (!tip) continue;
    list.push({
      id: 10000 + dayOfYear(when),
      title: tip.title,
      body: tip.body,
      schedule: { at: when, allowWhileIdle: true },
      smallIcon: "ic_stat_icon_config_sample",
    });
  }
  if (!list.length) return 0;
  try {
    await ln.schedule({ notifications: list });
    return list.length;
  } catch {
    return 0;
  }
}

/** One now, so someone who just turned it on can see that it works. */
export async function sendSample(seconds = 5) {
  const ln = plugin();
  if (!ln) return false;
  const tip = tipOfDay();
  if (!tip) return false;
  try {
    await ln.schedule({
      notifications: [{
        id: 19999,
        title: tip.title,
        body: tip.body,
        schedule: { at: new Date(Date.now() + seconds * 1000) },
      }],
    });
    return true;
  } catch {
    return false;
  }
}
