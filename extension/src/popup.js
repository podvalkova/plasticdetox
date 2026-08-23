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
  $("logMisses").checked = s.logMisses !== false;
  $("updated").textContent = ago(s.brands_at);
}

$("logMisses").addEventListener("change", (e) => {
  chrome.storage.local.set({ logMisses: e.target.checked });
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
