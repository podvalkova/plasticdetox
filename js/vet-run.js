/**
 * Running a Check Pass, shared by the pages that can run one.
 *
 * Two pages now start a check: vet.html, which is the product's own page with a
 * log and a stopwatch, and Product Check, where a check is one card inside a
 * page about something else. They draw the result differently and they should,
 * so only the drawing stays on the pages. The transport lives here, once.
 *
 * It is a separate file rather than a second copy because index.html and
 * store.html each grew their own product array and then disagreed about what
 * the store sold. A streaming reader is a worse thing to keep two of.
 *
 * Plain script, not a module, so a page can load it without changing the type
 * of the inline script it already has.
 */
window.VetRun = (function () {
  var WORKER = "https://plasticdetox-quiz-email.plasticdetox.workers.dev";
  var PASS_KEY = "pdVetPass";

  /** The pass is per browser and shared across our pages on this origin. */
  function getPass() {
    try { return localStorage.getItem(PASS_KEY) || ""; } catch (e) { return ""; }
  }

  function setPass(p) {
    try { localStorage.setItem(PASS_KEY, p || ""); } catch (e) {}
  }

  /** Checks left on a pass, or null when we cannot tell. Never throws. */
  async function balance(pass) {
    if (!pass) return null;
    try {
      var r = await fetch(WORKER + "/vet-balance?pass=" + encodeURIComponent(pass));
      if (!r.ok) return null;
      var d = await r.json();
      return typeof d.balance === "number" ? d.balance : null;
    } catch (e) { return null; }
  }

  /**
   * Run one check, streaming.
   *
   * The worker answers as server sent events: a `front` event per check as it
   * lands, then one `done`. onFront may be called several times, onDone exactly
   * once. This never throws; a dropped connection arrives as onDone({error}),
   * because a half drawn card with an exception behind it is the worst outcome
   * for someone who just spent a check.
   */
  async function run(req, handlers) {
    var onFront = (handlers && handlers.onFront) || function () {};
    var onDone = (handlers && handlers.onDone) || function () {};
    var lost = "Connection lost. Your check was not charged unless the full card was delivered.";
    var r;
    try {
      r = await fetch(WORKER + "/vet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pass: req.pass, brand: req.brand, product: req.product }),
      });
    } catch (e) { onDone({ error: lost }); return; }

    if (!r.ok) {
      var d = await r.json().catch(function () { return {}; });
      onDone({ error: d.error || ("Error " + r.status) });
      return;
    }

    var reader = r.body.getReader(), dec = new TextDecoder(), buf = "";
    try {
      for (;;) {
        var step = await reader.read();
        if (step.done) break;
        buf += dec.decode(step.value, { stream: true });
        var i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          var chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (chunk.indexOf("data: ") !== 0) continue;
          var e;
          try { e = JSON.parse(chunk.slice(6)); } catch (err) { continue; }
          if (e.internal) continue;
          if (e.front) onFront(e);
          if (e.done) onDone(e);
        }
      }
    } catch (err) { onDone({ error: lost }); }
  }

  // The worker answers with four step keys and both pages have to name them
  // the same way. They did not: vet.html said "Recalls & lawsuits" and Product
  // Check said "Lawsuits", so a recall finding was printed under a heading that
  // claimed it was a lawsuit. One map, used by both.
  var STEP = {
    formula: "Formula",
    materials: "Materials",
    legal: "Recalls & lawsuits",
    testing: "Independent tests",
  };

  return { WORKER: WORKER, getPass: getPass, setPass: setPass, balance: balance, run: run, STEP: STEP };
})();
