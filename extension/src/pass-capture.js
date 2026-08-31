// Runs only on plasticdetox.org/vet.html: when someone opens their check
// pass link, the pass is captured into extension storage, so the "Check it
// now" button on Amazon listings can spend from the same pass with no typing.
// The page keeps the pass in its own localStorage too; either source counts.
(() => {
  "use strict";
  try {
    const fromUrl = new URLSearchParams(location.search).get("pass") || "";
    const fromPage = localStorage.getItem("pdVetPass") || "";
    const pass = (fromUrl || fromPage).trim();
    if (pass && /^[a-z0-9]{20,64}$/i.test(pass)) {
      chrome.storage.local.set({ vetPass: pass });
    }
  } catch (e) { /* never break the page */ }
})();
