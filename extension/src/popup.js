const $ = (id) => document.getElementById(id);

function ago(ts) {
  if (!ts) return "";
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 2) return "updated just now";
  if (mins < 60) return `updated ${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `updated ${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `updated ${days} day${days === 1 ? "" : "s"} ago`;
}

async function paint() {
  const s = await chrome.storage.local.get(["brands", "asins", "brands_at", "logMisses"]);
  $("brandCount").textContent = s.brands ? s.brands.length.toLocaleString() : "—";
  $("asinCount").textContent = s.asins ? Object.keys(s.asins).length.toLocaleString() : "—";
  $("logMisses").checked = s.logMisses === true;
  $("updated").textContent = ago(s.brands_at);
}

// Reaching the worker is the only thing this extension does that needs a host
// permission, and it only happens for people who switch this on. So it is
// declared optional and requested here, inside the click that turns it on,
// rather than being granted to everyone at install time.
const WORKER_ORIGIN = "https://plasticdetox-quiz-email.plasticdetox.workers.dev/*";

$("logMisses").addEventListener("change", async (e) => {
  const on = e.target.checked;
  if (!on) {
    await chrome.storage.local.set({ logMisses: false });
    chrome.permissions.remove({ origins: [WORKER_ORIGIN] });
    return;
  }
  const granted = await chrome.permissions.request({ origins: [WORKER_ORIGIN] });
  if (!granted) {
    e.target.checked = false;   // user declined the prompt, leave it off
    return;
  }
  await chrome.storage.local.set({ logMisses: true });
});

$("refresh").addEventListener("click", async () => {
  const btn = $("refresh");
  btn.disabled = true;
  btn.textContent = "Refreshing…";
  await chrome.runtime.sendMessage({ type: "refresh" });
  await paint();
  btn.disabled = false;
  btn.textContent = "Refresh brand data";
});

paint();
