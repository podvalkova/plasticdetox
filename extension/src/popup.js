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
  const s = await chrome.storage.local.get(["brands", "asins", "brands_at", "logMisses", "vetPass"]);
  $("brandCount").textContent = s.brands ? s.brands.length.toLocaleString() : "—";
  $("asinCount").textContent = s.asins ? Object.keys(s.asins).length.toLocaleString() : "—";
  $("logMisses").checked = s.logMisses === true;
  $("updated").textContent = ago(s.brands_at);
  paintPass(s.vetPass || "");
}

// The check pass: the worker's CORS allows this extension's origin, so the
// balance lookup needs no host permission and no key ever leaves the pass.
const VET_WORKER = "https://plasticdetox-quiz-email.plasticdetox.workers.dev";

async function paintPass(pass) {
  if (!pass) return;
  $("passInput").value = pass;
  $("passStatus").textContent = "Checking your pass…";
  try {
    const r = await fetch(`${VET_WORKER}/vet-balance?pass=${encodeURIComponent(pass)}`);
    const d = await r.json();
    $("passStatus").textContent = d.ok
      ? `Pass active: ${d.balance} check${d.balance === 1 ? "" : "s"} left. ` +
        "On any listing we have not covered, the panel offers Check this product now."
      : "That pass was not recognised.";
  } catch (e) {
    $("passStatus").textContent = "Could not reach the server to check the pass.";
  }
}

$("passSave").addEventListener("click", async () => {
  const pass = $("passInput").value.trim();
  if (!/^[a-z0-9]{20,64}$/i.test(pass)) {
    $("passStatus").textContent = "That does not look like a pass code. It is the long code from your pass link.";
    return;
  }
  await chrome.storage.local.set({ vetPass: pass });
  paintPass(pass);
});

$("passGet").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://plasticdetox.org/vet.html" });
});

// Reaching the worker is the only thing this extension does that needs a host
// permission, and it only happens for people who switch this on. So it is
// declared optional and requested here, inside the click that turns it on,
// rather than being granted to everyone at install time.
const WORKER_ORIGIN = "https://plasticdetox-quiz-email.plasticdetox.workers.dev/*";

$("logMisses").addEventListener("change", async (e) => {
  const on = e.target.checked;
  e.target.disabled = true;
  try {
    if (on) {
      // Resolves false if the user dismisses Chrome's permission prompt, so the
      // setting can never end up on without the grant that makes it work.
      const granted = await chrome.permissions.request({ origins: [WORKER_ORIGIN] });
      await chrome.storage.local.set({ logMisses: granted === true });
    } else {
      await chrome.storage.local.set({ logMisses: false });
      await chrome.permissions.remove({ origins: [WORKER_ORIGIN] });
    }
  } catch (err) {
    // Leave stored state untouched; the repaint below will show what it really is.
  } finally {
    e.target.disabled = false;
    // Storage is the single source of truth. The checkbox flips itself on click,
    // so without this it would keep showing "on" through a dismissed prompt.
    await paint();
  }
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
