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

  /**
   * The whole pass: what is left, what was bought, what has been spent.
   *
   * `balance` alone was all this returned, so a page that wanted to draw a bar
   * had nothing to make it a fraction of and guessed at the pack size. Guessing
   * put a number on screen that nobody had bought. The worker has known the
   * real figure all along.
   *
   * Null when we cannot tell. Never throws.
   */
  async function passInfo(pass) {
    if (!pass) return null;
    try {
      var r = await fetch(WORKER + "/vet-balance?pass=" + encodeURIComponent(pass));
      if (!r.ok) return null;
      var d = await r.json();
      if (typeof d.balance !== "number") return null;
      return { balance: d.balance,
               purchased: typeof d.purchased === "number" ? d.purchased : null,
               used: typeof d.used === "number" ? d.used : null };
    } catch (e) { return null; }
  }

  /** Checks left on a pass, or null when we cannot tell. Never throws. */
  async function balance(pass) {
    var info = await passInfo(pass);
    return info ? info.balance : null;
  }

  /**
   * Run one check, streaming.
   *
   * `req` is {pass, brand, product, url, fresh}. The url matters: the worker
   * reads a pasted link to find out what the product is, and Product Check used
   * to drop it and send the hostname as the brand instead. `fresh` asks for the
   * product to be researched again rather than answered from what we hold, and
   * the worker decides whether that costs anything.
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
    // Things the worker learns before it has settled anything: the product's
    // real name, and the recall databases answering ahead of the lawsuit
    // search. They carry a step but no front, so they never reach onFront and
    // never settle a row. A page that does not want them simply omits this.
    var onProgress = (handlers && handlers.onProgress) || function () {};
    var lost = "Connection lost. Your check was not charged unless the full card was delivered.";
    var r;
    try {
      r = await fetch(WORKER + "/vet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pass: req.pass, brand: req.brand, product: req.product,
                               url: req.url || "", fresh: req.fresh === true }),
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
          else if (e.done) onDone(e);
          else if (e.step) onProgress(e);
        }
      }
    } catch (err) { onDone({ error: lost }); }
  }

  /**
   * What a pasted product link tells us before anyone fetches anything.
   *
   * Ported from the app's match.js, which learned all of this first. The web
   * had a two line version of it that recognised a link only when the scheme
   * was still on the front, and only on Amazon, and only when the product name
   * sat in the path right before /dp/. A link copied off a phone arrives as
   * "amazon.com/WoodWick-.../dp/B00E0KSLC0?pf_rd_p=..." with no scheme, so it
   * was not recognised as a link at all and got printed as the product name,
   * query string and all, across four lines of the card.
   *
   * It never guesses a verdict, only an identity, and the page shows what it
   * read so a person can correct it.
   *
   * One deliberate difference from the app: this returns the address even when
   * it can name nothing, because the worker can research a link it is handed
   * and cannot research a link we threw away.
   */
  var MARKETPLACE = /^(amazon|amzn|a\.co|target|walmart|ebay|etsy|costco|samsclub|kroger|instacart|thrivemarket|iherb|vitacost|wayfair|overstock|shop|tiktok|temu|shein|aliexpress|google|bing)\b/i;
  // Path words that route rather than name: /dp/, /products/, /ip/.
  var PATH_NOISE = ["dp", "gp", "product", "products", "p", "ip", "d", "o", "item", "items",
    "shop", "store", "collections", "catalog", "pd", "buy", "en", "en-us", "us",
    // Amazon's sponsored hop and its shop fronts route too: /sspa/click, and
    // /stores/WoodWick/page/1234. Without these, "Click" was offered as a
    // product name.
    "sspa", "click", "stores", "page", "slredirect"];
  // An address for an address. Nothing in it names a product and following it
  // needs a request, so we hand the whole thing to the check rather than
  // offering "2xY9abc" as a product name.
  var SHORTENER = /^(https?:\/\/)?(a\.co|amzn\.to|amzn\.eu|bit\.ly|tinyurl\.com|t\.co|shorturl\.at|rstyle\.me|shop\.app)\b/i;
  // An address, wherever it sits in what was pasted. A phone's share sheet
  // hands over the title and the link together, "WoodWick Hourglass Candle
  // https://a.co/d/2xY9abc", and demanding the address come first read that
  // whole string as a product name.
  var ADDRESS = /(?:https?:\/\/|(?:[a-z0-9-]+\.)+[a-z]{2,}\/)[^\s<>"']*/i;

  /** The address inside a pasted string, and whatever was pasted around it. */
  function findAddress(input) {
    var s = String(input || "").trim();
    var m = s.match(ADDRESS);
    if (!m) return null;
    // Trailing punctuation belongs to the sentence, not to the address.
    var href = m[0].replace(/[.,;:!?)\]]+$/, "");
    var text = (s.slice(0, m.index) + " " + s.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim();
    return { href: /^https?:\/\//i.test(href) ? href : "https://" + href, text: text };
  }

  /** Does this carry a web address at all. */
  function linkish(s) { return Boolean(findAddress(s)); }

  function titleCase(s) {
    return String(s || "").replace(/[-_]+/g, " ").replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }).trim();
  }

  /** A slug reads as lowercase-with-hyphens. People read sentences. */
  function tidy(s) {
    // A shop's own SKU rides at the end of most slugs: "balance-bike-black-03619".
    var t = String(s || "").replace(/\s+\d[\d\s]*$/, "").replace(/\s+/g, " ").trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
  }

  function parseLink(input) {
    var found = findAddress(input);
    if (!found) return null;
    if (SHORTENER.test(found.href)) {
      return { url: found.href, host: "", asin: "", brand: "", product: "",
               marketplace: true, shortened: true, text: found.text };
    }
    var url;
    try { url = new URL(found.href); } catch (e) { return null; }
    // A sponsored placement is a redirect wearing a product link's clothes: the
    // real address is folded into its query string, and the path it shows says
    // only "click".
    if (/\/(?:sspa\/click|gp\/slredirect)/i.test(url.pathname)) {
      var inner = url.searchParams.get("url") || url.searchParams.get("u");
      if (inner) { try { url = new URL(inner, url.origin); } catch (e) {} }
    }
    var host = url.hostname.toLowerCase().replace(/^www\./, "");
    var segs = url.pathname.split("/").map(function (s) { return s.trim(); }).filter(Boolean);

    // The ASIN, wherever it sits. Amazon puts it after /dp/, /gp/product/ or
    // /product/, and a short a.co link has none at all.
    var asin = "";
    for (var i = 0; i < segs.length; i++) {
      if (/^[A-Z0-9]{10}$/.test(segs[i]) && /[0-9]/.test(segs[i])) { asin = segs[i]; break; }
    }

    // The slug is the longest segment that names rather than routes. Target
    // writes /p/up-up-baby-wipes/-/A-79362508, Amazon writes the name BEFORE
    // /dp/, and a brand shop writes it last, so position cannot be trusted.
    var named = segs.filter(function (s) { return PATH_NOISE.indexOf(s.toLowerCase()) < 0; })
      .filter(function (s) { return !/^[A-Z0-9]{10}$/.test(s); })
      .filter(function (s) { return !/^[-a-z]?\d[\d-]*$/i.test(s); })
      .filter(function (s) { return !/^a-\d+$/i.test(s); })
      // Amazon's tracking crumb sits in the path like any other segment, and on
      // a link with no product name in it, "ref=pd_bxgy_d_sccl_1" was the
      // longest thing left and would have become the product name.
      .filter(function (s) { return !/^ref=/i.test(s); })
      .map(function (s) { return s.replace(/[-_+]+/g, " ").replace(/\.(html?|php|aspx)$/i, "").trim(); })
      .filter(function (s) { return s.length > 2 && /[a-z]{3}/i.test(s); });
    named.sort(function (a, b) { return b.length - a.length; });

    var marketplace = MARKETPLACE.test(host);
    // A brand's own shop names the maker in its address. "ifyoucare.com" is If
    // You Care, and no amount of typing gets that more right.
    return {
      url: url.href,
      host: host,
      asin: asin,
      brand: marketplace ? "" : titleCase(host.split(".").slice(0, -1).pop() || ""),
      product: tidy(named[0] || ""),
      marketplace: marketplace,
      shortened: false,
      text: found.text,
    };
  }

  /** The product name a link carries, or "" when it carries none. */
  function linkName(hit) {
    if (!hit) return "";
    var fromUrl = [hit.brand, hit.product].filter(Boolean).join(" ").trim();
    if (fromUrl) return fromUrl.slice(0, 70);
    // Nothing in the address names it, so fall back to whatever was pasted
    // around the address: on a share sheet that text is the product's own
    // title, and it is the only name anybody has.
    return String(hit.text || "").replace(/[:\-–—]+\s*$/, "").trim().slice(0, 70);
  }


  /**
   * Which product row a typed query is actually about.
   *
   * Ported from the app's match.js, which has had this right for a while. The
   * website did not use it, so Product Check found the brand and stopped:
   * somebody typing "Cuisinart PerfecTemp 1.7-Liter Electric Kettle" got
   * Cuisinart the brand, a skip, when that kettle's own row says careful. They
   * asked about one kettle and were handed a harsher verdict belonging to the
   * company's other products.
   *
   * Rule 1.1 is inside the matcher, in the same form the app uses: a title
   * naming one product must never be answered by a sibling carrying a BETTER
   * verdict. A worse sibling may still answer, because adverse evidence is
   * allowed to travel and a warning shown in error costs nobody their health.
   */
  function pnorm(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function productFor(brand, opts) {
    var o = opts || {};
    var rows = (brand && brand.products) || [];
    if (o.asin) {
      var exact = rows.find(function (p) {
        return Array.isArray(p.asins) && p.asins.indexOf(o.asin) >= 0;
      });
      if (exact) return exact;
    }
    if (!o.title) return null;
    var low = " " + pnorm(o.title) + " ";

    // Tolerate the singular/plural split between an editorial name and a real
    // listing title: we write "Aveeno Sunscreens", the label says "Sunscreen".
    // A unit written the way a listing writes it, and the way a person types
    // it, are the same word. The matchers are authored from Amazon titles, so
    // the Cuisinart kettle's group asks for "7l" while somebody searching
    // types "1.7 Liter", and one token out of four missing threw the whole
    // match away: they got the brand's skip instead of that kettle's careful.
    var UNIT = { l: ["liter", "litre"], ml: ["milliliter", "millilitre"], oz: ["ounce", "ounces"],
                 qt: ["quart", "quarts"], g: ["gram", "grams"], kg: ["kilogram", "kilograms"] };
    var hasWord = function (w) {
      var n = pnorm(w);
      if (!n) return false;
      if (low.indexOf(" " + n + " ") >= 0) return true;
      if (n.slice(-1) === "s" && low.indexOf(" " + n.slice(0, -1) + " ") >= 0) return true;
      if (low.indexOf(" " + n + "s ") >= 0) return true;
      var m = n.match(/^(\d+)(l|ml|oz|qt|g|kg)$/);
      if (m && UNIT[m[2]]) {
        return UNIT[m[2]].concat([m[2]]).some(function (word) {
          return low.indexOf(" " + m[1] + " " + word + " ") >= 0;
        });
      }
      return false;
    };

    var best = null, bestLen = 0, bestDirect = false, bestEvidence = -1;
    var isDirect = function (p) { return p.origin !== "brand-line"; };
    var evidenceOf = function (p) {
      var f = (p.ext && p.ext.fronts) || {};
      return Object.keys(f).filter(function (k) {
        var v = f[k];
        return v && v !== "unassessed" && v !== "unknown";
      }).length;
    };
    var RANK = { skip: 0, careful: 1, unrated: 2, good: 3 };
    var rankOf = function (p) {
      var v = (p.ext || {}).verdict;
      return RANK[v] === undefined ? 2 : RANK[v];
    };
    var namesItself = function (p) {
      var n = pnorm(p.name || "");
      return !!n && low.indexOf(" " + n + " ") >= 0;
    };
    var better = function (p, len, d) {
      if (best && namesItself(best) && !namesItself(p) && rankOf(p) > rankOf(best)) return false;
      if (namesItself(p) && best && !namesItself(best)) return true;
      if (d !== bestDirect) return d;
      var e = evidenceOf(p);
      if (e !== bestEvidence) return e > bestEvidence;
      return len > bestLen;
    };

    rows.forEach(function (p) {
      if ((p.matchNot || []).some(hasWord)) return;
      (p.match || []).forEach(function (phrase) {
        var needle = pnorm(phrase);
        if (!needle || low.indexOf(needle) < 0) return;
        var d = isDirect(p);
        if (better(p, needle.length, d)) {
          best = p; bestLen = needle.length; bestDirect = d; bestEvidence = evidenceOf(p);
        }
      });
      (p.matchAll || []).forEach(function (group) {
        if (!group.length || !group.every(hasWord)) return;
        var weight = group.join("").length;
        var d = isDirect(p);
        if (better(p, weight, d)) {
          best = p; bestLen = weight; bestDirect = d; bestEvidence = evidenceOf(p);
        }
      });
      // The row's own name, which the app gets from `match` and we often do
      // not: "Foton Pearled Candle, scented" is a row nobody wrote a matcher
      // for, and typing it should still find it.
      var own = pnorm(p.name || "");
      if (own && own.split(" ").length > 1 && own.split(" ").every(hasWord)) {
        var d2 = isDirect(p);
        if (better(p, own.length, d2)) {
          best = p; bestLen = own.length; bestDirect = d2; bestEvidence = evidenceOf(p);
        }
      }
      // A model name is an identifier, and one is enough. "PerfecTemp" belongs
      // to exactly one Cuisinart row, so somebody typing it has named that
      // kettle whether or not they also typed its capacity. The test is that
      // the word tells this row apart from its siblings: a long word every row
      // shares, "stainless", identifies nothing and is ignored.
      own.split(" ").forEach(function (word) {
        if (word.length < 8 || !hasWord(word)) return;
        var owners = rows.filter(function (q) {
          return pnorm(q.name || "").split(" ").indexOf(word) >= 0;
        });
        if (owners.length !== 1) return;
        var d3 = isDirect(p);
        if (better(p, word.length, d3)) {
          best = p; bestLen = word.length; bestDirect = d3; bestEvidence = evidenceOf(p);
        }
      });
    });
    return best;
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

  return { WORKER: WORKER, getPass: getPass, setPass: setPass, balance: balance, passInfo: passInfo,
           run: run, STEP: STEP, linkish: linkish, parseLink: parseLink, linkName: linkName,
           productFor: productFor };
})();
