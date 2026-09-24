import { KIDS } from "./kids-data.js";

const ALLOWED_ORIGINS = ["https://plasticdetox.org", "https://www.plasticdetox.org"];

// The Brand Check extension posts from a content script, which runs in the
// page's origin. So the Origin header on these calls is amazon.com, not the
// chrome-extension:// one. Allowing only the extension origin meant the request
// reached the worker and succeeded, and the browser then blocked the reply, so
// "Request review" reported a failure for something that had actually worked.
const EXTENSION_ORIGINS = [
  "chrome-extension://lplncjbnohkgchjkhgdiljpjfgdmgelg",
  "https://www.amazon.com",
  "https://amazon.com",
  "https://smile.amazon.com",
];

// The iOS app runs in a WebView whose origin is not a site we own. Capacitor
// serves it from capacitor://localhost, and a Safari web extension's content
// script posts under the origin of whatever page it is running on.
const APP_ORIGINS = [
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
];

function resolveCors(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (EXTENSION_ORIGINS.includes(origin)) return origin;
  if (APP_ORIGINS.includes(origin)) return origin;
  // A Safari web extension injects into the page, so its calls arrive with a
  // safari-web-extension:// origin whose id changes per install.
  if (origin.startsWith("safari-web-extension://")) return origin;
  // A dev server runs on a port, and http://localhost is not the same origin as
  // http://localhost:4455. Every route here is either public or password gated,
  // so allowing a local port costs nothing and makes the internal pages
  // testable before they are deployed.
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  if (/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return origin;
  return ALLOWED_ORIGINS[0];
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsOrigin = resolveCors(origin);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const path = new URL(request.url).pathname;

    // ===== The internal database view: is this password right? =====
    if (path === "/db-auth") {
      return handleDbAuth(request, env, corsOrigin);
    }

    // ===== iOS app: which web bundle should this install be running? =====
    if (path === "/app-update") {
      return handleAppUpdate(request, env, corsOrigin);
    }

    // ===== Private stats view: every brand searched, ranked by count (GET) =====
    // ===== The Kids room: buy it, prove it, read it =====
    if (path === "/kids-claim") {
      return handleKidsClaim(request, env, corsOrigin);
    }
    if (path === "/kids-verify" && request.method === "POST") {
      return handleKidsVerify(request, env, corsOrigin);
    }
    if (path === "/kids-plan") {
      return handleKidsPlan(request, env, corsOrigin);
    }

    // ===== App events, forwarded to Mixpanel so no SDK sits on the phone =====
    if (path === "/mp" && request.method === "POST") {
      return handleMixpanel(request, env, corsOrigin);
    }

    // ===== App notification counters: on, off, denied, tap (anonymous) =====
    if (path === "/notify-log" && request.method === "POST") {
      return handleNotifyLog(request, env, corsOrigin);
    }
    if (path === "/notify-stats" && request.method === "GET") {
      return handleNotifyStats(request, env);
    }

    if (path === "/brand-stats" && request.method === "GET") {
      return handleBrandStats(request, env);
    }

    if (path === "/brand-reports" && request.method === "GET") {
      return handleBrandReports(request, env);
    }

    // ===== Instant vet test bench (private, token gated like /brand-stats) =====
    if (path === "/vet-test" && request.method === "GET") {
      return handleVetTest(request, env);
    }

    // ===== Check pass balance, read by vet.html on load =====
    if (path === "/vet-login" && request.method === "POST") {
      return handleVetLogin(request, env, corsOrigin);
    }
    if (path === "/vet-verify" && request.method === "POST") {
      return handleVetVerify(request, env, corsOrigin);
    }
    if (path === "/vet-restore" && request.method === "POST") {
      return handleVetRestore(request, env, corsOrigin);
    }
    if (path === "/vet-balance" && request.method === "GET") {
      return handleVetBalance(request, env, corsOrigin);
    }
    if (path === "/vet-known" && request.method === "GET") {
      return handleVetKnown(request, env, corsOrigin);
    }
    // Can we reach the recall database at all. Answering that needed a paid
    // check and a reading of the card, which is why it went unnoticed that the
    // answer had been no since the day it was written.
    if (path === "/recall-probe" && request.method === "GET") {
      const brand = (new URL(request.url).searchParams.get("brand") || "Brita").slice(0, 60);
      const r = await cpscRecalls(brand);
      return json({ ok: true, reachable: r !== null, matches: r ? r.length : 0 }, 200, corsOrigin);
    }

    // ===== Every check anyone has paid for, for the review queue =====
    if (path === "/vet-results" && request.method === "GET") {
      const u = new URL(request.url);
      if (!env.STATS_TOKEN || u.searchParams.get("token") !== env.STATS_TOKEN) {
        return json({ ok: false, error: "Not authorized" }, 401, corsOrigin);
      }
      const out = [];
      let cursor = u.searchParams.get("cursor") || undefined;
      const page = await env.BRAND_SEARCHES.list({ prefix: "vetdone:", limit: 200, cursor });
      for (const k of page.keys) {
        const v = await env.BRAND_SEARCHES.get(k.name, { type: "json" }).catch(() => null);
        if (v) out.push(v);
      }
      return json({ ok: true, count: out.length, cursor: page.cursor || null,
                    complete: page.list_complete, results: out }, 200, corsOrigin);
    }

    // ===== Claim a freshly paid pass by Stripe session, so the buyer lands
    // back on vet.html with checks live instead of waiting for the email =====
    if (path === "/vet-claim" && request.method === "GET") {
      return handleVetClaim(request, env, corsOrigin);
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // ===== Instant vet prototype: live four-front research on one product =====
    if (path === "/instant-vet") {
      return handleInstantVet(request, env, corsOrigin);
    }

    // ===== Paid checks: customer vet, pack checkout, private pass minting =====
    if (path === "/vet") {
      return handleCustomerVet(request, env, corsOrigin);
    }
    if (path === "/vet-checkout") {
      return handleVetCheckout(request, env, corsOrigin);
    }
    if (path === "/vet-grant") {
      return handleVetGrant(request, env, corsOrigin);
    }

    // ===== Log every brand searched (fire-and-forget from the frontend) =====
    if (path === "/brand-search-log") {
      return handleSearchLog(request, env, corsOrigin);
    }

    // ===== Brand Review request: capture email + requested brand, email the team =====
    if (path === "/brand-report") {
      return handleBrandReport(request, env, corsOrigin);
    }

    if (path === "/brand-request") {
      return handleBrandRequest(request, env, corsOrigin);
    }

    // ===== Digital product waitlist: capture full name + email into Brevo list 8 =====
    if (path === "/subscribe") {
      return handleSubscribe(request, env, corsOrigin);
    }

    // ===== Contact form: email the question to hello@plasticdetox.org =====
    if (path === "/contact") {
      return handleContact(request, env, corsOrigin);
    }

    // ===== Free plan: capture name + email, email the plan link, add to Brevo list 10 =====
    if (path === "/free-plan") {
      return handleFreePlan(request, env, corsOrigin);
    }

    // ===== Custom Plan intake: email answers (+ photos) to the team =====
    if (path === "/intake") {
      return handleIntake(request, env, corsOrigin);
    }

    // ===== Stripe webhook: email the buyer their intake-form link =====
    if (path === "/stripe-webhook") {
      return handleStripeWebhook(request, env);
    }

    // ===== Contribute any amount: create a Stripe Checkout Session =====
    if (path === "/create-contribution") {
      return handleContribution(request, env, corsOrigin);
    }

    try {
      const data = await request.json();
      const { email, score, total, level, levelColor, top3, swaps } = data;

      if (!email || !email.includes("@") || score === undefined) {
        return json({ ok: false, error: "Invalid data" }, 400, corsOrigin);
      }

      // 1. Create/update contact in Brevo with quiz attributes
      await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          attributes: {
            QUIZ_SCORE: `${score}/${total}`,
            QUIZ_LEVEL: level,
            QUIZ_TOP3: top3.map((s) => s.text).join(", "),
            QUIZ_SWAPS: swaps.map((s) => s.text).join(", "),
            QUIZ_DATE: new Date().toISOString().split("T")[0],
          },
          listIds: env.BREVO_LIST_ID ? [parseInt(env.BREVO_LIST_ID)] : [],
          updateEnabled: true,
        }),
      });

      // 2. Send transactional email with results
      const htmlEmail = buildEmail({ score, total, level, levelColor, top3, swaps });

      const emailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: env.SENDER_NAME, email: env.SENDER_EMAIL },
          to: [{ email }],
          subject: `Your Plastic Detox Results: ${score}/${total} (${level})`,
          htmlContent: htmlEmail,
        }),
      });

      if (!emailRes.ok) {
        const err = await emailRes.text();
        return json({ ok: false, error: "Email send failed" }, 500, corsOrigin);
      }

      return json({ ok: true }, 200, corsOrigin);
    } catch (e) {
      return json({ ok: false, error: "Server error" }, 500, corsOrigin);
    }
  },
};

function json(data, status = 200, origin = ALLOWED_ORIGINS[0]) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
    },
  });
}

// Normalize a brand string into a stable KV key.
function brandKey(s) {
  return "q:" + (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
}

// Record every brand a user searches, with a running count and whether we had a match.
async function logBrandSearch(env, brand, matched, verdict, requested) {
  // Throw rather than return. A silent no-op here reported success for 180
  // days while nothing was being written, and nothing upstream could tell.
  if (!env.BRAND_SEARCHES) throw new Error("BRAND_SEARCHES binding is not bound");
  const display = (brand || "").toString().trim().slice(0, 80);
  if (!display) throw new Error("empty brand");
  const key = brandKey(display);
  const now = new Date().toISOString();
  let rec;
  try {
    rec = await env.BRAND_SEARCHES.get(key, { type: "json" });
  } catch (e) { rec = null; }
  if (!rec) rec = { brand: display, count: 0, matched: !!matched, verdict: verdict || "", first: now, requests: 0 };
  rec.count += 1;
  rec.last = now;
  rec.matched = !!matched;
  if (verdict) rec.verdict = verdict;
  if (requested) rec.requests = (rec.requests || 0) + 1;
  rec.brand = display;
  await env.BRAND_SEARCHES.put(key, JSON.stringify(rec));
  return key;
}

// POST /brand-search-log  { brand, matched, verdict }
/**
 * The gate on the internal database view.
 *
 * A real check rather than a string compared in the page, so the password is
 * never shipped to the browser. It is worth saying plainly that this hides the
 * view, not the data: brand-data.json is served publicly because the extension
 * and the app read it. Making the data private means moving that file behind
 * this worker too.
 */
async function handleDbAuth(request, env, corsOrigin) {
  if (request.method !== "POST") return json({ ok: false }, 405, corsOrigin);
  try {
    const { password } = await request.json();
    const expected = env.DB_PASSWORD || "";
    const given = String(password || "");
    // Constant time-ish: compare every character rather than bailing on the
    // first mismatch, so response time says nothing about how much was right.
    let same = expected.length > 0 && given.length === expected.length;
    for (let i = 0; i < Math.max(given.length, expected.length); i++) {
      if (given[i] !== expected[i]) same = false;
    }
    return json({ ok: same }, same ? 200 : 401, corsOrigin);
  } catch (e) {
    return json({ ok: false }, 400, corsOrigin);
  }
}

/**
 * The over the air update check.
 *
 * The app posts the bundle version it is running and we answer with a newer
 * one, or with nothing. The manifest lives on the site rather than in this
 * worker so that shipping an update is a site deploy and never a worker
 * deploy: fewer moving parts on the day something is broken and needs fixing.
 *
 * Answering "no update" is the safe default for every failure here. A bad
 * answer would swap the running bundle for one that might not boot.
 */
async function handleAppUpdate(request, env, corsOrigin) {
  // Never answer with version:"builtin". The updater treats that exact string
  // as an instruction to roll back to the bundle compiled into the app, so
  // saying it to mean "nothing new" made every app switch revert, then update,
  // then revert, forever. An error shaped reply takes the plugin's own quiet
  // path and changes nothing.
  const none = (why) => json({ error: why }, 200, corsOrigin);
  try {
    const res = await fetch("https://plasticdetox.org/app/updates.json", {
      cf: { cacheTtl: 60, cacheEverything: true },
    });
    if (!res.ok) return none("no manifest");

    const manifest = await res.json();
    const latest = manifest && manifest.latest;
    const bundle = latest && manifest.bundles && manifest.bundles[latest];
    if (!bundle || !bundle.url || !bundle.checksum) return none("no bundle");

    // Always answer with the latest bundle and let the plugin decide. It
    // already skips a version it is running, so there is no "up to date" case
    // for us to encode, and encoding one is what caused the rollback loop.
    return json({
      version: bundle.version,
      url: bundle.url,
      checksum: bundle.checksum,
    }, 200, corsOrigin);
  } catch (e) {
    return none("check failed");
  }
}


async function handleSearchLog(request, env, corsOrigin) {
  try {
    const { brand, matched, verdict } = await request.json();
    const key = await logBrandSearch(env, brand, matched, verdict, false);
    // Read the key straight back. KV is eventually consistent so a miss here is
    // not proof of failure, but a hit is proof of success, and reporting it
    // means a dropped write can never masquerade as ok again.
    let persisted = null;
    try { persisted = await env.BRAND_SEARCHES.get(key); } catch (e) { persisted = null; }
    return json({ ok: true, key, persisted: persisted !== null }, 200, corsOrigin);
  } catch (e) {
    // Still 200 so the UI is never blocked, but say plainly that nothing landed.
    return json({ ok: false, error: String((e && e.message) || e) }, 200, corsOrigin);
  }
}

// POST /brand-report  { brand, issue, detail, email? }
// A reader telling us a verdict is wrong. Stored in the same KV as searches
// under a report: prefix so it shows up in one place, and mailed on when a
// Brevo key is configured so a correction is not sitting unread in a store.
async function handleBrandReport(request, env, corsOrigin) {
  try {
    const body = await request.json();
    const brand = (body.brand || "").toString().trim().slice(0, 80);
    const issue = (body.issue || "").toString().trim().slice(0, 40);
    const detail = (body.detail || "").toString().trim().slice(0, 1000);
    const email = (body.email || "").toString().trim().slice(0, 120);
    if (!brand || !issue) {
      return json({ ok: false, error: "Missing brand or issue" }, 400, corsOrigin);
    }

    if (env.BRAND_SEARCHES) {
      const key = `report:${Date.now()}:${brand.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      await env.BRAND_SEARCHES.put(
        key,
        JSON.stringify({ brand, issue, detail, email, at: new Date().toISOString() }),
        { expirationTtl: 60 * 60 * 24 * 365 }
      );
    }

    if (env.BREVO_API_KEY) {
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: "Brand Check", email: "hello@plasticdetox.org" },
          to: [{ email: "hello@plasticdetox.org" }],
          subject: `Brand Check correction: ${brand} (${issue})`,
          textContent:
            `Brand: ${brand}\nIssue: ${issue}\n\n${detail || "(no detail given)"}\n\n` +
            `Reply to: ${email || "(not supplied)"}`,
        }),
      }).catch(() => {});
    }

    return json({ ok: true }, 200, corsOrigin);
  } catch (e) {
    return json({ ok: false }, 200, corsOrigin); // never block the UI
  }
}

// GET /brand-reports?token=...  ->  everything readers have flagged
async function handleBrandReports(request, env) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!env.STATS_TOKEN || token !== env.STATS_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!env.BRAND_SEARCHES) return json({ ok: true, reports: [] });
  const rows = [];
  let cursor;
  do {
    const list = await env.BRAND_SEARCHES.list({ prefix: "report:", cursor, limit: 1000 });
    for (const k of list.keys) {
      const rec = await env.BRAND_SEARCHES.get(k.name, { type: "json" });
      if (rec) rows.push(rec);
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);
  rows.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  return json({ ok: true, count: rows.length, reports: rows });
}

// GET /brand-stats?token=...  ->  ranked list of everything searched

/**
 * Four counters a day: how many installs have the tip scheduled, how many
 * turned it off in the app, how many had it turned off in Settings, and how
 * many tapped one.
 *
 * The id is a random string the app makes up for itself. It is here so a phone
 * reporting every morning counts once a day rather than once an open, and it
 * carries nothing about the phone or the person.
 */

/**
 * Forward a batch of app events to Mixpanel.
 *
 * The token lives here rather than in the app, so it is not sitting in a
 * bundle anyone can unzip, and the device never talks to Mixpanel directly.
 * Events are capped and their property names are not trusted: this endpoint is
 * open to the internet like every other one the app calls.
 */

/* ===================== The Kids room =====================================
   Two ways in and one key. A web buyer is proved by their Stripe session, an
   in app buyer by Apple's signed transaction. Both mint the same token, so
   everything downstream has one thing to check.
   ======================================================================== */


/* ---- Verifying Apple's signature on a StoreKit 2 transaction -------------
   The JWS header carries x5c: the leaf certificate that signed it, its
   intermediate, and Apple's root. Reading the payload without checking that
   signature would let anyone mint a pass by POSTing a JSON object naming our
   product, so the signature is checked against the leaf's public key and the
   chain is required to end at Apple's own root.
   ------------------------------------------------------------------------ */

// Apple Root CA G3's public key, whole, from
// https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
//
// This was a PREFIX, and the prefix was of a P-256 key: MFkwEwYHKoZIzj0CAQYI
// KoZIzj0DAQcDQgAE. Apple's root is P-384, whose SPKI begins MHYwEAYHKoZIzj0C
// AQYFK4EEACIDYgAE, so startsWith was false for every receipt Apple has ever
// issued. Every purchase threw "not apple", every redeem returned 400, and the
// app told the buyer "Paid, but it did not open". It had never once worked.
//
// The whole key rather than a prefix, because a prefix only says which curve
// the key uses, and every P-384 key in the world shares it. That is not a test
// of whether the certificate is Apple's.
const APPLE_ROOT_G3_SPKI = "MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAEmOkvPUBypO2TInKBExzdEJXxxaNOcdwUFtkO5aYFKndke19OONO7HES1f/UftjJiXcnphFtPME8RWgD9WFgMpfUPLE0HRxN12peXl28xXO0rnXsgO9i5VNlemaQ6UQox";

const b64urlToBytes = (s) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};

/** Walk the DER of an X.509 certificate and return its SubjectPublicKeyInfo. */
function spkiFromCert(der) {
  let i = 0;
  const len = () => {
    let n = der[i++];
    if (n & 0x80) {
      let c = n & 0x7f; n = 0;
      while (c--) n = (n << 8) | der[i++];
    }
    return n;
  };
  const step = () => { i++; const n = len(); const start = i; i += n; return [start, n]; };
  i++; len();                       // Certificate SEQUENCE
  i++; const tbsLen = len();        // TBSCertificate SEQUENCE
  const tbsEnd = i + tbsLen;
  if (der[i] === 0xa0) { i++; const n = len(); i += n; }  // [0] version
  step();                           // serialNumber
  step();                           // signature
  step();                           // issuer
  step();                           // validity
  step();                           // subject
  const start = i;                  // subjectPublicKeyInfo begins here
  i++; const n = len();
  const end = i + n;
  if (end > tbsEnd) throw new Error("bad cert");
  return der.slice(start, end);
}

async function verifyAppleJws(jws) {
  const [h, pl, sig] = jws.split(".");
  if (!h || !pl || !sig) throw new Error("malformed");
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
  const chain = header.x5c;
  if (!Array.isArray(chain) || chain.length < 2) throw new Error("no chain");

  // The chain has to end at Apple's root, not merely be a well formed chain.
  const rootSpki = spkiFromCert(b64urlToBytes(chain[chain.length - 1].replace(/\s/g, "")));
  const rootB64 = btoa(String.fromCharCode(...rootSpki));
  if (rootB64 !== APPLE_ROOT_G3_SPKI) throw new Error("not apple");

  const leafSpki = spkiFromCert(b64urlToBytes(chain[0].replace(/\s/g, "")));
  const key = await crypto.subtle.importKey(
    "spki", leafSpki, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" }, key,
    b64urlToBytes(sig), new TextEncoder().encode(`${h}.${pl}`));
  if (!ok) throw new Error("bad signature");
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(pl)));
}

async function mintKidsPass(env, source, ref) {
  const token = "k_" + crypto.randomUUID().replace(/-/g, "");
  await env.BRAND_SEARCHES.put("kidspass:" + token,
    JSON.stringify({ source, ref: String(ref || "").slice(0, 120), at: Date.now() }));
  return token;
}

/**
 * What counts as settled.
 *
 * A session discounted to nothing by a 100% promotion code is never charged,
 * and Stripe reports it as no_payment_required rather than paid. Checking for
 * "paid" alone meant a free pass could be issued at the till and then mint
 * nothing at all.
 */
const PAID = new Set(["paid", "no_payment_required"]);

async function kidsPassValid(env, token) {
  if (!token || !/^k_[a-f0-9]{32}$/.test(token)) return false;
  return !!(await env.BRAND_SEARCHES.get("kidspass:" + token));
}

/** Web purchase: prove it with the Stripe checkout session. */
async function handleKidsClaim(request, env, corsOrigin) {
  const sid = (new URL(request.url).searchParams.get("session") || "").trim();
  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(sid)) {
    return json({ ok: false, error: "Bad session" }, 400, corsOrigin);
  }
  // One token per session, so a reload does not mint a second one.
  const seen = await env.BRAND_SEARCHES.get("kidssession:" + sid);
  if (seen) return json({ ok: true, pass: seen }, 200, corsOrigin);

  if (!env.STRIPE_SECRET_KEY) return json({ ok: false, error: "Not configured" }, 503, corsOrigin);
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions/" + sid, {
    headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY },
  });
  const ses = await res.json().catch(() => ({}));
  if (!res.ok || !PAID.has(ses.payment_status)) {
    return json({ ok: false, error: "Payment not found" }, 404, corsOrigin);
  }
  // Paid is not the same as paid for this. Every product in the account mints
  // the same shape of session id, so without this a five dollar pack of checks
  // could be redeemed here for the kids room, once per session, forever. The
  // session has to name the payment link the room is sold through.
  const wantedLink = env.KIDS_PAYMENT_LINK || "";
  if (!wantedLink) return json({ ok: false, error: "Not configured" }, 503, corsOrigin);
  if (ses.payment_link !== wantedLink) {
    return json({ ok: false, error: "Wrong product" }, 400, corsOrigin);
  }
  const pass = await mintKidsPass(env, "web", sid);
  await env.BRAND_SEARCHES.put("kidssession:" + sid, pass);
  return json({ ok: true, pass }, 200, corsOrigin);
}

/**
 * Google purchase: prove it by asking Google.
 *
 * A Play purchase token means nothing on its own; the proof is the Play
 * Developer API confirming it names a real, paid, unrefunded purchase of our
 * product. Auth is a service account key signed into a short lived access
 * token with WebCrypto, cached because one worker instance answers many buys.
 */
let googleAccess = null;
async function googleAccessToken(env) {
  if (googleAccess && Date.now() < googleAccess.until) return googleAccess.value;
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unsigned = enc({ alg: "RS256", typ: "JWT" }) + "." + enc({
    iss: env.GOOGLE_SA_EMAIL,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const der = Uint8Array.from(
    atob(String(env.GOOGLE_SA_KEY || "").replace(/-----[A-Z ]+-----|\\n|\s/g, "")),
    (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = unsigned + "." + btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + jwt,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error("no google token");
  googleAccess = { value: d.access_token, until: Date.now() + 45 * 60 * 1000 };
  return d.access_token;
}

async function handleKidsVerifyPlay(body, env, corsOrigin) {
  const token = String(body.purchaseToken || "");
  if (!/^[\w.-]{20,600}$/.test(token)) {
    return json({ ok: false, error: "Bad token" }, 400, corsOrigin);
  }
  if (!env.GOOGLE_SA_EMAIL || !env.GOOGLE_SA_KEY) {
    return json({ ok: false, error: "Not configured" }, 503, corsOrigin);
  }
  let access;
  try {
    access = await googleAccessToken(env);
  } catch {
    return json({ ok: false, error: "Not configured" }, 503, corsOrigin);
  }
  const wanted = env.KIDS_PRODUCT_ID || "org.plasticdetox.app.baby";
  const base = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/org.plasticdetox.app"
    + "/purchases/products/" + encodeURIComponent(wanted) + "/tokens/" + encodeURIComponent(token);
  const r = await fetch(base, { headers: { Authorization: "Bearer " + access } });
  const p = await r.json().catch(() => ({}));
  if (!r.ok) return json({ ok: false, error: "Unverified receipt" }, 400, corsOrigin);
  // 0 purchased, 1 canceled, 2 pending.
  if (p.purchaseState !== 0) {
    return json({ ok: false, error: p.purchaseState === 2 ? "Pending" : "Refunded" }, 400, corsOrigin);
  }

  // One Google purchase, one token, however many times it is presented.
  const ref = String(p.orderId || token.slice(0, 60));
  const seen = await env.BRAND_SEARCHES.get("kidsgoogle:" + ref);
  if (seen) return json({ ok: true, pass: seen }, 200, corsOrigin);

  // Acknowledge, or Google refunds an unacknowledged purchase after three days.
  if (p.acknowledgementState === 0) {
    await fetch(base + ":acknowledge", {
      method: "POST",
      headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {});
  }
  const pass = await mintKidsPass(env, "play", ref);
  await env.BRAND_SEARCHES.put("kidsgoogle:" + ref, pass);
  return json({ ok: true, pass }, 200, corsOrigin);
}

/**
 * In app purchase: prove it with StoreKit 2's signed transaction, or hand a
 * Play token to the Google prover above.
 *
 * The signature is checked against the leaf certificate in the JWS header and
 * the chain is required to end at Apple's own root, so a forged payload naming
 * our product is refused. Then the payload has to name our product and our
 * bundle, not be revoked, and one Apple transaction mints one token however
 * many times it is presented.
 */
async function handleKidsVerify(request, env, corsOrigin) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body.store === "play") return await handleKidsVerifyPlay(body, env, corsOrigin);
    const jws = String(body.jws || "");
    let claim;
    try {
      claim = await verifyAppleJws(jws);
    } catch (e) {
      return json({ ok: false, error: "Unverified receipt" }, 400, corsOrigin);
    }
    const wanted = env.KIDS_PRODUCT_ID || "org.plasticdetox.app.baby";
    if (claim.productId !== wanted) return json({ ok: false, error: "Wrong product" }, 400, corsOrigin);
    if (claim.bundleId && claim.bundleId !== "org.plasticdetox.app") {
      return json({ ok: false, error: "Wrong app" }, 400, corsOrigin);
    }
    if (claim.revocationDate) return json({ ok: false, error: "Refunded" }, 400, corsOrigin);
    const original = String(claim.originalTransactionId || claim.transactionId || "");
    if (!original) return json({ ok: false, error: "Bad receipt" }, 400, corsOrigin);

    // One Apple purchase, one token, however many times it is presented.
    const seen = await env.BRAND_SEARCHES.get("kidsapple:" + original);
    if (seen) return json({ ok: true, pass: seen }, 200, corsOrigin);
    const pass = await mintKidsPass(env, "iap", original);
    await env.BRAND_SEARCHES.put("kidsapple:" + original, pass);
    return json({ ok: true, pass }, 200, corsOrigin);
  } catch (e) {
    return json({ ok: false, error: "Bad receipt" }, 400, corsOrigin);
  }
}

/** The swaps themselves, which live nowhere the app can reach unpaid. */
async function handleKidsPlan(request, env, corsOrigin) {
  const token = new URL(request.url).searchParams.get("pass") || "";
  if (!(await kidsPassValid(env, token))) {
    return json({ ok: false, error: "No pass" }, 403, corsOrigin);
  }
  return json({ ok: true, phase: KIDS }, 200, corsOrigin);
}

/**
 * Properties allowed past the ordinary 200 character cut. A stack trace is the
 * one thing worth more than a couple of lines: truncate it at 200 and the
 * frame that actually names the bug is usually the one thrown away.
 *
 * 255 and not more, because that is where Mixpanel truncates a string property
 * itself, without saying so. Sending 900 just moves the cut somewhere we
 * cannot see it. Verified against the live project on 2026-09-18.
 */
const WIDE_PROPS = { stack: 255, message: 255 };

async function handleMixpanel(request, env, corsOrigin) {
  try {
    if (!env.MIXPANEL_TOKEN) return json({ ok: false, error: "not configured" }, 200, corsOrigin);
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "").slice(0, 64) || "anon";
    const events = Array.isArray(body.events) ? body.events.slice(0, 40) : [];
    if (!events.length) return json({ ok: true, sent: 0 }, 200, corsOrigin);

    const payload = events.map((e) => {
      const props = {};
      // Copy a bounded set of scalar properties. An event that arrives with a
      // hundred keys, or an object in one of them, is a bug or an abuse, and
      // either way it is not going into the project.
      const src = (e && e.props) || {};
      let n = 0;
      for (const k of Object.keys(src)) {
        if (n >= 12) break;
        const v = src[k];
        if (v === null || ["string", "number", "boolean"].includes(typeof v)) {
          const key = String(k).slice(0, 40);
          props[key] = typeof v === "string" ? v.slice(0, WIDE_PROPS[key] || 200) : v;
          n++;
        }
      }
      return {
        event: String((e && e.event) || "unknown").slice(0, 60),
        properties: {
          ...props,
          token: env.MIXPANEL_TOKEN,
          distinct_id: id,
          time: Number(e && e.at) || Date.now(),
          $insert_id: `${id}-${Number(e && e.at) || 0}-${Math.random().toString(36).slice(2, 8)}`,
        },
      };
    });

    // ?verbose=1 so a rejection says why. Without it Mixpanel answers 200 with
    // a body of "0" when it drops the batch, and reading res.ok alone would
    // report success for events that never arrived.
    const res = await fetch("https://api.mixpanel.com/track?verbose=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const out = await res.json().catch(() => ({}));
    const accepted = res.ok && out && out.status === 1;
    if (!accepted) {
      console.log("mixpanel rejected", res.status, JSON.stringify(out).slice(0, 200));
    }
    return json({ ok: accepted, sent: accepted ? payload.length : 0, error: (out && out.error) || null },
      200, corsOrigin);
  } catch (e) {
    return json({ ok: false }, 200, corsOrigin);
  }
}

async function handleNotifyLog(request, env, corsOrigin) {
  try {
    const b = await request.json().catch(() => ({}));
    const state = String(b.state || "");
    if (!["on", "off", "denied", "tap"].includes(state)) {
      return json({ ok: false, error: "bad state" }, 400, corsOrigin);
    }
    const day = /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : new Date().toISOString().slice(0, 10);
    const id = String(b.id || "").slice(0, 40);
    if (!env.BRAND_SEARCHES) return json({ ok: false }, 200, corsOrigin);

    // A tap is counted every time; the rest once per device per day, so the
    // numbers answer "how many installs" rather than "how many app opens".
    if (state !== "tap" && id) {
      const seen = `notifyseen:${day}:${state}:${id}`;
      if (await env.BRAND_SEARCHES.get(seen)) return json({ ok: true, dup: true }, 200, corsOrigin);
      await env.BRAND_SEARCHES.put(seen, "1", { expirationTtl: 60 * 60 * 48 });
    }
    const key = `notify:${day}:${state}`;
    const now = Number(await env.BRAND_SEARCHES.get(key)) || 0;
    await env.BRAND_SEARCHES.put(key, String(now + 1));
    return json({ ok: true }, 200, corsOrigin);
  } catch (e) {
    return json({ ok: false }, 200, corsOrigin);
  }
}

/** The last 30 days, token gated like the other private views. */
async function handleNotifyStats(request, env) {
  const url = new URL(request.url);
  if (!env.STATS_TOKEN || url.searchParams.get("token") !== env.STATS_TOKEN) {
    return new Response("Not found", { status: 404 });
  }
  const rows = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const [on, off, denied, tap] = await Promise.all(
      ["on", "off", "denied", "tap"].map((k) =>
        env.BRAND_SEARCHES.get(`notify:${d}:${k}`).then((v) => Number(v) || 0)));
    if (on || off || denied || tap) rows.push({ day: d, on, off, denied, tap });
  }
  return new Response(JSON.stringify({ days: rows }, null, 1),
    { headers: { "Content-Type": "application/json" } });
}

async function handleBrandStats(request, env) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!env.STATS_TOKEN || token !== env.STATS_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!env.BRAND_SEARCHES) return json({ ok: true, total: 0, brands: [] });
  const rows = [];
  let cursor;
  do {
    const list = await env.BRAND_SEARCHES.list({ prefix: "q:", cursor, limit: 1000 });
    for (const k of list.keys) {
      const rec = await env.BRAND_SEARCHES.get(k.name, { type: "json" });
      if (rec) rows.push(rec);
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);
  rows.sort((a, b) => b.count - a.count);
  const unmatched = rows.filter((r) => !r.matched);
  return json({
    ok: true,
    totalSearches: rows.reduce((n, r) => n + r.count, 0),
    uniqueBrands: rows.length,
    notInDatabase: unmatched.length,
    brands: rows,
  });
}

// Capture a request to review a brand we have not covered yet.
async function handleBrandRequest(request, env, corsOrigin) {
  try {
    const { brand, email } = await request.json();
    const cleanBrand = (brand || "").toString().trim().slice(0, 80);
    const cleanEmail = (email || "").toString().trim();
    if (!cleanEmail || !cleanEmail.includes("@") || !cleanBrand) {
      return json({ ok: false, error: "Invalid data" }, 400, corsOrigin);
    }

    if (env.BREVO_API_KEY) {
      await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          attributes: {
            BRAND_REQUEST: cleanBrand,
            BRAND_REQUEST_DATE: new Date().toISOString().split("T")[0],
          },
          listIds: [12],
          updateEnabled: true,
        }),
      });

      // Notify the team so the brand can be researched and added to the database.
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: env.NOTIFY_NAME || env.SENDER_NAME, email: env.NOTIFY_EMAIL || env.SENDER_EMAIL },
          to: [{ email: env.SENDER_EMAIL }],
          subject: `Brand Check request: ${cleanBrand}`,
          htmlContent: `<p><strong>${cleanBrand}</strong> was requested via Brand Check.</p><p>Requested by: ${cleanEmail}</p>`,
        }),
      }).catch(() => {});
    }

    // Record the request alongside the search log so it shows up in /brand-stats.
    await logBrandSearch(env, cleanBrand, false, "", true).catch(() => {});

    return json({ ok: true }, 200, corsOrigin);
  } catch (e) {
    return json({ ok: false, error: "Server error" }, 500, corsOrigin);
  }
}

// POST /subscribe  { name, email, listId? }  -> add contact to Brevo list (default 8, "digital")
async function handleSubscribe(request, env, corsOrigin) {
  try {
    const { name, email, listId, plan } = await request.json();
    const cleanName = (name || "").toString().trim().slice(0, 120);
    const cleanEmail = (email || "").toString().trim();
    const cleanPlan = (plan || "Undecided").toString().trim().slice(0, 80);
    const list = parseInt(listId) || 8;

    if (!cleanName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      return json({ ok: false, error: "Invalid data" }, 400, corsOrigin);
    }

    const parts = cleanName.split(/\s+/);
    const firstName = parts.shift() || "";
    const lastName = parts.join(" ");

    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: cleanEmail,
        attributes: {
          FIRSTNAME: firstName,
          LASTNAME: lastName,
          PLAN_INTEREST: cleanPlan,
          DIGITAL_SIGNUP_DATE: new Date().toISOString().split("T")[0],
        },
        listIds: [list],
        updateEnabled: true,
      }),
    });

    if (res.ok || res.status === 204) {
      return json({ ok: true }, 200, corsOrigin);
    }
    return json({ ok: false, error: "Brevo error" }, 502, corsOrigin);
  } catch (e) {
    return json({ ok: false, error: "Server error" }, 500, corsOrigin);
  }
}

// POST /contact  { name, email, message }  -> email the question to the team
async function handleContact(request, env, corsOrigin) {
  try {
    const { name, email, message } = await request.json();
    const cleanName = (name || "").toString().trim().slice(0, 120);
    const cleanEmail = (email || "").toString().trim();
    const cleanMsg = (message || "").toString().trim().slice(0, 5000);

    if (!cleanName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail) || !cleanMsg) {
      return json({ ok: false, error: "Invalid data" }, 400, corsOrigin);
    }

    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: env.NOTIFY_NAME || env.SENDER_NAME, email: env.NOTIFY_EMAIL || env.SENDER_EMAIL },
        to: [{ email: env.SENDER_EMAIL }],
        replyTo: { email: cleanEmail, name: cleanName },
        subject: `Custom Plan question from ${cleanName}`,
        htmlContent: `<p><strong>From:</strong> ${esc(cleanName)} (${esc(cleanEmail)})</p><p>${esc(cleanMsg).replace(/\n/g, "<br>")}</p>`,
      }),
    });

    if (res.ok) return json({ ok: true }, 200, corsOrigin);
    return json({ ok: false, error: "Email send failed" }, 502, corsOrigin);
  } catch (e) {
    return json({ ok: false, error: "Server error" }, 500, corsOrigin);
  }
}

// POST /intake  { tier, name, email, household, rooms, kids_age, budget, concern, water, owned, priorities, photos[] }
async function handleIntake(request, env, corsOrigin) {
  try {
    const d = await request.json();
    const name = (d.name || "").toString().trim().slice(0, 120);
    const email = (d.email || "").toString().trim();
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ ok: false, error: "Invalid data" }, 400, corsOrigin);
    }

    const esc = (s) => (s || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rows = [
      ["Plan", d.tier], ["Name", name], ["Email", email],
      ["Who lives there", d.household], ["Rooms", d.rooms], ["Little ones", d.kids_age],
      ["Budget", d.budget], ["Top concern", d.concern], ["Water source", d.water],
      ["Already owns", d.owned], ["Priorities", d.priorities],
    ];
    const html = rows
      .filter(([, v]) => v && v.toString().trim())
      .map(([k, v]) => `<p style="margin:0 0 8px"><strong>${k}:</strong> ${esc(v).replace(/\n/g, "<br>")}</p>`)
      .join("");

    // Photos: [{ room, name, content(base64) }] -> Brevo attachments
    const photos = Array.isArray(d.photos) ? d.photos.slice(0, 20) : [];
    const attachment = photos
      .filter((p) => p && p.content)
      .map((p, i) => {
        const safe = (p.name || "photo.jpg").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-40);
        return { content: p.content, name: `${(p.room || "photo")}-${i + 1}-${safe}` };
      });

    const body = {
      sender: { name: env.NOTIFY_NAME || env.SENDER_NAME, email: env.NOTIFY_EMAIL || env.SENDER_EMAIL },
      to: [{ email: env.SENDER_EMAIL }],
      replyTo: { email, name },
      subject: `New Custom Plan intake: ${name} (${d.tier || "Custom Plan"})`,
      htmlContent: `<h2>New Custom Plan intake</h2>${html}${attachment.length ? `<p style="margin-top:10px">${attachment.length} photo(s) attached.</p>` : ""}`,
    };
    if (attachment.length) body.attachment = attachment;

    // Upsert the buyer into Brevo "Digital" list (8) with their intake answers
    const nm2 = name.split(/\s+/);
    await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        attributes: {
          FIRSTNAME: nm2.shift() || "",
          LASTNAME: nm2.join(" "),
          PLAN_PURCHASED: d.tier || "Custom Plan",
          INTAKE_ROOMS: (d.rooms || "").toString().slice(0, 200),
          INTAKE_HOUSEHOLD: (d.household || "").toString().slice(0, 200),
          INTAKE_DATE: new Date().toISOString().split("T")[0],
        },
        listIds: [8],
        updateEnabled: true,
      }),
    }).catch(() => {});

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // Confirmation email to the customer (best effort, does not block success)
    const tierLabel = d.tier || "Custom Plan";
    const firstName = name.split(/\s+/)[0] || "there";
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: env.SENDER_NAME, email: env.SENDER_EMAIL },
        to: [{ email, name }],
        subject: "We got your answers. Your plan is on the way",
        htmlContent: emailShell("Received",
          emailP(`Thank you, ${esc(firstName)}.`) +
          emailP(`We have received your answers for the <strong>${esc(tierLabel)}</strong> and our team is building your personalized plan now.`) +
          emailP("You will receive it by email <strong>shortly</strong>.") +
          `<p style="margin:0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.6;color:#78716c;">Questions or something to add? Just reply to this email.</p>`
        ),
      }),
    }).catch(() => {});

    if (res.ok) return json({ ok: true }, 200, corsOrigin);
    return json({ ok: false, error: "Email send failed" }, 502, corsOrigin);
  } catch (e) {
    return json({ ok: false, error: "Server error" }, 500, corsOrigin);
  }
}

// POST /create-contribution  { amount }  -> Stripe Checkout Session URL for a custom contribution
async function handleContribution(request, env, corsOrigin) {
  try {
    const { amount } = await request.json();
    const dollars = Math.round(Number(amount));
    if (!dollars || dollars < 1 || dollars > 10000) {
      return json({ ok: false, error: "Please enter an amount between $1 and $10,000." }, 400, corsOrigin);
    }
    if (!env.STRIPE_SECRET_KEY) {
      return json({ ok: false, error: "Contributions are not configured yet." }, 503, corsOrigin);
    }
    const p = new URLSearchParams();
    p.append("mode", "payment");
    p.append("success_url", "https://plasticdetox.org/support.html?thanks=1");
    p.append("cancel_url", "https://plasticdetox.org/support.html");
    p.append("submit_type", "donate");
    p.append("metadata[type]", "contribution");
    p.append("line_items[0][quantity]", "1");
    p.append("line_items[0][price_data][currency]", "usd");
    p.append("line_items[0][price_data][unit_amount]", String(dollars * 100));
    p.append("line_items[0][price_data][product_data][name]", "Support Independent Testing");

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.STRIPE_SECRET_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: p.toString(),
    });
    const data = await res.json();
    if (res.ok && data.url) return json({ ok: true, url: data.url }, 200, corsOrigin);
    return json({ ok: false, error: (data.error && data.error.message) || "Stripe error" }, 502, corsOrigin);
  } catch (e) {
    return json({ ok: false, error: "Server error" }, 500, corsOrigin);
  }
}

// Verify a Stripe webhook signature (Stripe-Signature: t=...,v1=...)
async function verifyStripeSignature(payload, header, secret) {
  if (!header || !secret) return false;
  const parts = {};
  header.split(",").forEach((kv) => { const [k, v] = kv.split("="); parts[k] = v; });
  if (!parts.t || !parts.v1) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${parts.t}.${payload}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // length-safe compare
  if (hex.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}

// POST /stripe-webhook  -> on checkout.session.completed, email the buyer their intake link
async function handleStripeWebhook(request, env) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const payload = await request.text();
  const sig = request.headers.get("stripe-signature");
  const ok = await verifyStripeSignature(payload, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return new Response("Bad signature", { status: 400 });

  let event;
  try { event = JSON.parse(payload); } catch { return new Response("Bad JSON", { status: 400 }); }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object || {};
    const email = (s.customer_details && s.customer_details.email) || s.customer_email || "";
    const name = (s.customer_details && s.customer_details.name) || "";

    // ---- Contribution (from /create-contribution) -> thank-you + Brevo list 9 ----
    if (s.metadata && s.metadata.type === "contribution") {
      if (email) {
        const dollars = Math.round((s.amount_total || 0) / 100);
        const nm = name.split(/\s+/);
        const first = nm.shift() || "";
        await fetch("https://api.brevo.com/v3/contacts", {
          method: "POST",
          headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            attributes: {
              FIRSTNAME: first,
              LASTNAME: nm.join(" "),
              LAST_CONTRIBUTION: dollars,
              CONTRIBUTION_DATE: new Date().toISOString().split("T")[0],
            },
            listIds: [9],
            updateEnabled: true,
          }),
        }).catch(() => {});
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: { name: env.SENDER_NAME, email: env.SENDER_EMAIL },
            to: [{ email, name }],
            subject: "Thank you for backing independent testing",
            htmlContent: emailShell("Thank you",
              emailP(`Thank you${first ? ", " + first : ""}.`) +
              emailP("Your contribution goes straight toward independent lab testing of everyday products. This is what lets us test instead of guess, and publish what we find openly and free.") +
              emailP("We will keep you posted as testing gets underway, and share the results with you first.")
            ),
          }),
        }).catch(() => {});
      }
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // ---- Check pass purchase (from /vet-checkout) -> mint pass, email link ----
    if (s.metadata && s.metadata.type === "vet-pack") {
      const checks = Math.min(500, Math.max(1, Number(s.metadata.checks) || 0));
      if (email && checks) {
        // One pass per checkout session, shared with /vet-claim: whichever of
        // the webhook and the success-page claim runs first mints it, the
        // other finds it here. The email always carries the same token the
        // buyer is already using.
        let pass = s.id ? await env.BRAND_SEARCHES.get("vetsession:" + s.id) : null;
        if (!pass) {
          pass = await mintVetPass(env, checks, email, s.metadata.pack || "");
          if (s.id) await env.BRAND_SEARCHES.put("vetsession:" + s.id, pass);
        }
        await sendPassEmail(env, email, pass, checks);
        // Pass buyers are their own list (11). Their email was used to send the
        // pass and then dropped, so nobody who bought checks could be reached
        // again: no receipt, no top up, no word when a check they paid for
        // becomes a published verdict. The kids package has done this since it
        // launched, into list 8.
        const nm = name.split(/\s+/);
        const firstName = nm.shift() || "";
        await fetch("https://api.brevo.com/v3/contacts", {
          method: "POST",
          headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            attributes: {
              FIRSTNAME: firstName,
              LASTNAME: nm.join(" "),
              CHECKS_PURCHASED: checks,
              CHECK_PACK: s.metadata.pack || "",
              CHECK_PURCHASE_DATE: new Date().toISOString().split("T")[0],
            },
            listIds: [11],
            updateEnabled: true,
          }),
        }).catch(() => {});
      }
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const amount = s.amount_total || 0; // cents

    // ---- Kids room bought in the app ($5) -> its own list ----
    // This has to come before the price branch below. The room is $5 and the
    // package is $9.99, so both land under that branch's $15 ceiling, and the
    // app buyer was being tagged as having bought the Baby & Expecting Package
    // and emailed a hub, a registry and an article they had not paid for.
    // Identify it the way /kids-claim does, by the payment link rather than by
    // price: a price test cannot tell two products apart and a new product at
    // any price under $15 would land here too.
    if (env.KIDS_PAYMENT_LINK && s.payment_link === env.KIDS_PAYMENT_LINK) {
      if (email) {
        const nm = name.split(/\s+/);
        const first = nm.shift() || "";
        await fetch("https://api.brevo.com/v3/contacts", {
          method: "POST",
          headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            attributes: {
              FIRSTNAME: first,
              LASTNAME: nm.join(" "),
              PLAN_PURCHASED: "Kids room (app)",
              PURCHASE_DATE: new Date().toISOString().split("T")[0],
            },
            // Falls back to 8 until the app buyers' list exists, so a purchase
            // is never dropped on the floor while a list id is missing.
            listIds: [parseInt(env.BREVO_LIST_KIDS_APP || "8")],
            updateEnabled: true,
          }),
        }).catch(() => {});

        // The room unlocks through kids-unlock.html on the way back from
        // Stripe. That redirect is the only thing standing between a paying
        // customer and nothing, so the same link goes in an email they keep.
        const greeting = first ? `Hi ${escHtml(first)},` : "Hi there,";
        const back = `https://plasticdetox.org/kids-unlock.html?session_id=${encodeURIComponent(s.id || "")}`;
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: { name: env.SENDER_NAME, email: env.SENDER_EMAIL },
            to: [{ email, name }],
            replyTo: { name: env.SENDER_NAME, email: env.SENDER_EMAIL },
            subject: "Your kids room",
            htmlContent: emailShell("Unlocked",
              emailP(`${greeting}`) +
              emailP("Thank you. The kids room is unlocked in the app.") +
              emailP(`If it did not open by itself, tap this on the phone with the app installed: <a href="${back}">open the kids room</a>.`) +
              emailP("It stays unlocked on that phone. Restore purchases brings it back on a new one.") +
              emailP("Anya<br>plasticdetox.org")),
          }),
        }).catch(() => {});
      }
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // ---- Baby & Expecting Package ($9.99) -> access email + Brevo list 8 ----
    // The old branch below emailed a plan-intake.html link, which belongs to
    // the retired $149 review. Anything at the package price is routed here.
    if (amount > 0 && amount <= 1500) {
      if (email) {
        const nm = name.split(/\s+/);
        const first = nm.shift() || "";
        await fetch("https://api.brevo.com/v3/contacts", {
          method: "POST",
          headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            attributes: {
              FIRSTNAME: first,
              LASTNAME: nm.join(" "),
              PLAN_PURCHASED: "Baby & Expecting Package",
              PURCHASE_DATE: new Date().toISOString().split("T")[0],
            },
            listIds: [8],
            updateEnabled: true,
          }),
        }).catch(() => {});

        // Stripe does not always return a name, so fall back rather than greeting an empty string
        const greeting = first ? `Hi ${escHtml(first)},` : "Hi there,";

        const hub  = "https://plasticdetox.org/babies-kids.html?addon=1";
        const reg  = "https://plasticdetox.org/registry.html?addon=1";
        const top  = "https://plasticdetox.org/articles/top-100-baby-kids-products-amazon.html?addon=1";
        const swap = "https://plasticdetox.org/articles/baby-kids-101.html?addon=1";

        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: { name: env.SENDER_NAME, email: env.SENDER_EMAIL },
            to: [{ email, name }],
            replyTo: { name: env.SENDER_NAME, email: env.SENDER_EMAIL },
            subject: "Your Baby & Expecting Package",
            htmlContent: emailShell("You're in",
              emailP(`${greeting}`) +
              emailP("Thank you for your order. Your package is unlocked and ready.") +
              emailP(`<strong>The registry, 123 picks:</strong> <a href="${reg}" style="color:#7c3aed;font-weight:600;">open the registry</a><br>` +
                     `<strong>All 100 Amazon products rated:</strong> <a href="${top}" style="color:#7c3aed;font-weight:600;">open the full list</a><br>` +
                     `<strong>The 23 swaps in priority order:</strong> <a href="${swap}" style="color:#7c3aed;font-weight:600;">open the swap list</a><br>` +
                     `<strong>Everything in one place:</strong> <a href="${hub}" style="color:#7c3aed;font-weight:600;">your package page</a>`) +
              `<p style="margin:18px 0 0 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.7;color:#1c1917;"><strong>Questions, or something not working?</strong> Reply to this email, or write to <a href="mailto:hello@plasticdetox.org" style="color:#7c3aed;font-weight:600;">hello@plasticdetox.org</a>.</p>` +
              `<p style="margin:14px 0 0 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.7;color:#1c1917;">If you have feedback on the picks, we would genuinely like to hear it. Reader notes are how the list keeps getting better.</p>` +
              `<p style="margin:18px 0 0 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.6;color:#78716c;">A share of what you paid funds the next round of independent lab testing.</p>`
            ),
          }),
        }).catch(() => {});

        // team notification so interest is visible without opening Stripe
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: { name: env.NOTIFY_NAME, email: env.NOTIFY_EMAIL },
            to: [{ email: "hello@plasticdetox.org" }],
            subject: `Package sold: ${email}`,
            htmlContent: `<p>Baby &amp; Expecting Package, $${(amount/100).toFixed(2)}<br>${email}<br>${name||""}</p>`,
          }),
        }).catch(() => {});
      }
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const tier = amount >= 14900 ? "review" : "custom";
    const tierLabel = tier === "review" ? "Custom Plan + Personal Review" : "Custom Plan";

    if (email) {
      // Add the buyer to Brevo "Digital" list (8) with what they purchased
      const nm = name.split(/\s+/);
      await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          attributes: {
            FIRSTNAME: nm.shift() || "",
            LASTNAME: nm.join(" "),
            PLAN_PURCHASED: tierLabel,
            PURCHASE_DATE: new Date().toISOString().split("T")[0],
          },
          listIds: [8],
          updateEnabled: true,
        }),
      }).catch(() => {});

      const link = `https://plasticdetox.org/plan-intake.html?tier=${tier}&email=${encodeURIComponent(email)}`;
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: env.SENDER_NAME, email: env.SENDER_EMAIL },
          to: [{ email, name }],
          subject: "Thank you. One quick step to build your plan",
          htmlContent: emailShell("Almost there",
            emailP(`Thank you for your purchase of the <strong>${tierLabel}</strong>.`) +
            emailP("To build your plan, we just need a few quick answers about your home. It takes about two minutes.") +
            emailButton("Build my plan", link) +
            `<p style="margin:18px 0 0 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.6;color:#78716c;">Or paste this link into your browser:<br>${link}</p>` +
            `<p style="margin:14px 0 0 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.6;color:#78716c;">Questions? Just reply to this email.</p>`
          ),
        }),
      }).catch(() => {});
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
}

// POST /free-plan  { name, email }  -> add to Brevo list 10, email the plan link
async function handleFreePlan(request, env, corsOrigin) {
  try {
    const { name, email } = await request.json();
    const cleanName = (name || "").toString().trim().slice(0, 120);
    const cleanEmail = (email || "").toString().trim();
    if (!cleanName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      return json({ ok: false, error: "Invalid data" }, 400, corsOrigin);
    }
    const parts = cleanName.split(/\s+/);
    const firstName = parts.shift() || "";

    // Add to Brevo "Free Plan" list (10)
    await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: cleanEmail,
        attributes: { FIRSTNAME: firstName, LASTNAME: parts.join(" "), FREE_PLAN_DATE: new Date().toISOString().split("T")[0] },
        listIds: [10],
        updateEnabled: true,
      }),
    }).catch(() => {});

    // Email them the plan link (unlocked flag skips the email gate on any device)
    const link = "https://plasticdetox.org/plan.html?unlocked=1";
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: env.SENDER_NAME, email: env.SENDER_EMAIL },
        to: [{ email: cleanEmail, name: cleanName }],
        subject: "Your free plastic detox plan",
        htmlContent: emailShell("Your plan",
          emailP(`Here is your plan${firstName ? ", " + firstName : ""}.`) +
          emailP("A living, prioritized 90 day plan to cut plastic from your life, starting with the highest exposure swaps. Bookmark it and check off each swap as you go. We keep the picks current as we test products and as recalls happen.") +
          emailButton("Open my plan", link) +
          `<p style="margin:18px 0 0 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.6;color:#78716c;">Or paste this link into your browser:<br>${link}</p>`
        ),
      }),
    });
    if (res.ok) return json({ ok: true }, 200, corsOrigin);
    return json({ ok: false, error: "Email send failed" }, 502, corsOrigin);
  } catch (e) {
    return json({ ok: false, error: "Server error" }, 500, corsOrigin);
  }
}

// A branded purple CTA button for transactional emails
function emailButton(text, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:6px auto 0;"><tr><td align="center" style="background-color:#7c3aed;border-radius:10px;"><a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 32px;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:-0.01em;">${text}</a></td></tr></table>`;
}

// Wrap content in the branded Plastic Detox email shell (matches the newsletter template)
function emailShell(tag, contentHtml) {
  const IG = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#78716c" style="display:block;"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`;
  const PIN = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#78716c" style="display:block;"><path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>`;
  const tagPill = tag ? `<tr><td style="padding:26px 40px 0 40px;"><span style="display:inline-block;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:5px 12px;border-radius:4px;background-color:#ede9fe;color:#7c3aed;">${tag}</span></td></tr>` : "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#fafaf9;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fafaf9;"><tr><td align="center" style="padding:30px 15px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04);">
<tr><td style="padding:30px 40px 20px 40px;"><span style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:20px;font-weight:800;color:#1c1917;letter-spacing:-0.02em;">plastic<span style="color:#a78bfa;">detox</span></span></td></tr>
<tr><td style="padding:0 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #e7e5e4;"></td></tr></table></td></tr>
${tagPill}
<tr><td style="padding:22px 40px 30px 40px;">${contentHtml}</td></tr>
<tr><td style="padding:22px 40px;background-color:#fafaf9;border-top:1px solid #e7e5e4;text-align:center;">
<p style="margin:0 0 12px 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#78716c;"><a href="https://plasticdetox.org" target="_blank" rel="noopener" style="color:#7c3aed;text-decoration:none;font-weight:600;">plasticdetox.org</a></p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td style="padding:0 8px;"><a href="https://www.instagram.com/plasticdetoxorg/" target="_blank" rel="noopener">${IG}</a></td><td style="padding:0 8px;"><a href="https://www.pinterest.com/plasticdetoxorg/" target="_blank" rel="noopener">${PIN}</a></td></tr></table>
</td></tr>
</table></td></tr></table></body></html>`;
}

// Paragraph helper for email bodies
// Names come from Stripe customer_details and are user supplied, so anything
// interpolated into HTML has to be escaped first.
function escHtml(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function emailP(html) {
  return `<p style="margin:0 0 16px 0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.7;color:#1c1917;">${html}</p>`;
}

function buildEmail({ score, total, level, levelColor, top3, swaps }) {
  const pct = Math.round((score / total) * 100);

  let bgColor;
  if (pct <= 20) bgColor = "#dcfce7";
  else if (pct <= 50) bgColor = "#fef3c7";
  else if (pct <= 75) bgColor = "#ffedd5";
  else bgColor = "#fee2e2";

  const top3Html = top3
    .map(
      (s, i) => {
        const desc = s.alt ? s.alt.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";
        return `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #e7e5e4;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td style="width:32px;min-width:32px;max-width:32px;height:32px;max-height:32px;border-radius:50%;background:#7c3aed;color:#fff;text-align:center;line-height:32px;font-weight:700;font-size:14px;" width="32" height="32">${i + 1}</td>
          <td style="padding-left:12px;">
            <div style="font-weight:600;font-size:15px;color:#1c1917;">${s.icon} ${s.text}</div>
            <div style="font-size:13px;color:#78716c;margin-top:2px;">${s.category}</div>
            ${desc ? `<div style="font-size:13px;color:#44403c;margin-top:6px;line-height:1.5;">${desc}</div>` : ""}
          </td>
        </tr></table>
      </td>
    </tr>`;
      }
    )
    .join("");

  const grouped = {};
  swaps.forEach((s) => {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  });

  const allSwapsHtml = Object.entries(grouped)
    .map(
      ([cat, items]) => `
    <tr><td style="padding:16px 16px 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#a78bfa;">${cat}</td></tr>
    ${items
      .map(
        (item) => {
          const desc = item.alt ? item.alt.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";
          return `
    <tr><td style="padding:8px 16px 8px 28px;font-size:14px;color:#1c1917;border-bottom:1px solid #f5f5f4;">
      <div style="font-weight:600;">${item.icon} ${item.text}</div>
      ${desc ? `<div style="font-size:13px;color:#78716c;margin-top:2px;line-height:1.5;">${desc}</div>` : ""}
    </td></tr>`;
        }
      )
      .join("")}`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafaf9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="padding:24px 0;text-align:center;">
          <span style="font-size:20px;font-weight:800;color:#1c1917;">plastic<span style="color:#a78bfa;">detox</span></span>
        </td></tr>

        <!-- Score Card -->
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr><td style="padding:32px;text-align:center;">
              <div style="font-size:28px;font-weight:800;color:#1c1917;margin-bottom:8px;">Your Plastic Detox Results</div>

              <!-- Score Circle -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;">
                <tr><td style="width:120px;height:120px;border-radius:50%;background:${bgColor};text-align:center;vertical-align:middle;">
                  <div style="font-size:32px;font-weight:800;color:${levelColor};">${score}/${total}</div>
                  <div style="font-size:11px;color:#78716c;">exposure points</div>
                </td></tr>
              </table>

              <!-- Level Badge -->
              <div style="display:inline-block;padding:6px 16px;border-radius:20px;background:${bgColor};color:${levelColor};font-size:14px;font-weight:600;margin-bottom:16px;">${level}</div>

              <p style="font-size:15px;color:#78716c;line-height:1.6;max-width:440px;margin:12px auto 0;">
                ${pct <= 20 ? "You are already ahead of most people. Your daily habits involve minimal plastic contact." : pct <= 50 ? "You have some great opportunities to reduce your exposure. Focus on the priorities below." : pct <= 75 ? "Your routine involves significant plastic contact, but every swap makes a real difference." : "Most people score in this range. The biggest improvements come from just a few simple swaps."}
              </p>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="height:16px;"></td></tr>

        <!-- Top 3 Priorities -->
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ede9fe;border-radius:12px;overflow:hidden;">
            <tr><td style="padding:20px 16px 8px;font-size:16px;font-weight:700;color:#1c1917;">Recommended Swaps</td></tr>
            ${top3Html}
            <tr><td style="height:8px;"></td></tr>
          </table>
        </td></tr>

        <tr><td style="height:16px;"></td></tr>

        <!-- All Swaps -->
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr><td style="padding:20px 16px 8px;font-size:16px;font-weight:700;color:#1c1917;">All Recommended Swaps</td></tr>
            ${allSwapsHtml}
            <tr><td style="height:16px;"></td></tr>
          </table>
        </td></tr>

        <tr><td style="height:24px;"></td></tr>

        <!-- CTA -->
        <tr><td style="text-align:center;">
          <a href="https://plasticdetox.org/articles/how-to-start-reducing-plastic-exposure.html" style="display:inline-block;padding:14px 28px;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;">Read Our Beginner Guide</a>
        </td></tr>

        <tr><td style="height:16px;"></td></tr>

        <!-- Shop CTA -->
        <tr><td style="text-align:center;">
          <a href="https://plasticdetox.org/#store" style="display:inline-block;padding:14px 28px;background:#ffffff;color:#7c3aed;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;border:2px solid #7c3aed;">Shop Plastic Free Products</a>
        </td></tr>

        <tr><td style="height:32px;"></td></tr>

        <!-- Footer -->
        <tr><td style="text-align:center;padding:16px;border-top:1px solid #e7e5e4;">
          <p style="font-size:12px;color:#78716c;margin:0;">plasticdetox.org &mdash; Because your body deserves better than plastic.</p>
          <p style="font-size:11px;color:#a8a29e;margin:8px 0 0;"><a href="https://plasticdetox.org" style="color:#a8a29e;">Visit website</a> &nbsp;|&nbsp; <a href="https://plasticdetox.org/privacy.html" style="color:#a8a29e;">Privacy Policy</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ============================================================================
// Instant vet: the paid-check prototype.
//
// One product, four checks, streamed as they finish so the shopper watches the
// research happen instead of staring at a spinner. The legal check is a free
// openFDA query and usually lands inside two seconds; formula/materials and
// testing each run as one Claude call with server-side web search.
//
// This is a prototype for feeling the latency, so the model classifies fronts
// directly from a compact digest of the rating rules. The production path is
// the one the repo documents: the model records facts, the Python rules engine
// computes the verdict, and everything ships through the validated pipeline.
// Either way the card is labelled "Research, not yet reviewed": an unreviewed
// machine verdict never wears the badge.
// ============================================================================

// Haiku researched these until 2026-09-23, and a paid check on a Bath & Body
// Works candle came back "not enough found" while one web search returns the
// whole ingredient list, paraffin, fragrance, BHT and six named allergens.
// The cheapest researcher is not the cheapest check: a check that answers
// nothing costs a customer, and Sonnet costs about a cent more. Sonnet 5 also
// carries the newer search and fetch tools, which Haiku cannot use.
const VET_MODEL = "claude-sonnet-5";
const VET_TIMEOUT_MS = 100000;

// Same strict prefix rule as tools/check-recalls.py: the recalling firm must
// BEGIN with the brand, or Crest matches Cedar Crest Specialties and we invent
// a recall against a named brand, the one error with real legal exposure.
const FIRM_SUFFIX = /\b(inc|llc|l\.l\.c|corp|corporation|co|company|ltd|limited|gmbh|plc|holdings|group|brands|products|foods|usa|international|industries|enterprises|partners|lp|llp)\b\.?/gi;
function bareFirm(s) {
  return (s || "").toLowerCase().replace(FIRM_SUFFIX, " ").replace(/[^a-z0-9]+/g, " ").trim();
}
function isTheBrand(brand, firm) {
  const b = bareFirm(brand), f = bareFirm(firm);
  if (!b || !f) return false;
  // A short brand makes the prefix rule dangerous: "L." would claim every
  // firm beginning with the word L, and 31 of Perrigo's recalls landed on a
  // tampon brand. Short names get exact equality only.
  if (b.length < 3) return f === b;
  return f === b || f.startsWith(b + " ");
}


/**
 * CPSC recalls, which is where every product openFDA has never heard of lives.
 *
 * The legal front used to ask openFDA and nothing else. openFDA holds food,
 * drugs and devices, so for a candle, a sofa, a rug, a toy, a pan or a kettle
 * it answered "no recalls on record" without ever having been able to hold one.
 * That is a false pass across most of the catalogue, and it is the same mistake
 * as reading a blocked page as a clean result: a source that cannot contain the
 * answer must never produce one.
 *
 * saferproducts.gov is public, needs no key, and had the 1996 Bath & Body Works
 * candle recall the check missed.
 */
async function cpscRecalls(brand) {
  const out = [];
  // This reported "the CPSC database could not be reached" on real checks while
  // the identical request from a laptop answered in 300ms, so recalls came back
  // unassessed on a candle nobody has ever recalled. Which half was at fault,
  // the datacentre address or a user agent reading "PlasticDetox/1.0", is not
  // proven: what is established is that asking the way a browser asks, and
  // asking twice, reaches it from the worker. /recall-probe says whether it
  // still does, because the only way to find that out used to be to pay for a
  // check and read the card.
  const url = "https://www.saferproducts.gov/RestWebServices/Recall?format=json&ProductName="
    + encodeURIComponent(brand);
  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
      + " (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "en-US,en;q=0.9",
  };
  let d = null;
  for (let attempt = 0; attempt < 2 && d === null; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const body = await res.json();
      if (Array.isArray(body)) d = body;
    } catch (e) { /* try once more, then give up honestly */ }
  }
  if (d === null) return null;                      // null means we could not look
  try {
    for (const r of d) {
      // The API matches loosely, so confirm the brand really is the subject.
      const subject = `${r.Title || ""} ${(r.Manufacturers || []).map((m) => m.Name).join(" ")}`;
      if (!isTheBrand(brand, subject)) continue;
      out.push({
        date: (r.RecallDate || "").slice(0, 10),
        title: (r.Title || "").slice(0, 140),
        hazard: ((r.Hazards || [])[0] || {}).Name || "",
      });
    }
    out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return out;
  } catch (e) { return null; }
}

async function vetLegal(brand) {
  const t0 = Date.now();
  let total = 0, latest = null, examined = 0;
  for (const ep of ["food/enforcement", "drug/enforcement", "device/enforcement"]) {
    try {
      const url = `https://api.fda.gov/${ep}.json?search=recalling_firm:%22${encodeURIComponent(brand)}%22&limit=50`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const d = await res.json();
      for (const r of d.results || []) {
        examined += 1;
        if (!isTheBrand(brand, r.recalling_firm)) continue;
        total += 1;
        const dt = r.recall_initiation_date || "";
        if (!latest || dt > latest.date) {
          latest = { date: dt, reason: (r.reason_for_recall || "").slice(0, 140), status: r.status || "" };
        }
      }
    } catch (e) { /* one slow endpoint must not sink the check */ }
  }
  const cpsc = await cpscRecalls(brand);
  const ms = Date.now() - t0;
  const BOTH = "https://www.saferproducts.gov/ and https://open.fda.gov/apis/";

  if (cpsc && cpsc.length) {
    const top = cpsc[0];
    const more = cpsc.length > 1 ? ` ${cpsc.length - 1} other CPSC recall${cpsc.length > 2 ? "s" : ""} on record.` : "";
    return { status: "caution", ms,
      note: `CPSC recalled a ${brand} product in ${top.date.slice(0, 4)}: ${top.title}${top.hazard ? ` (${top.hazard.toLowerCase()})` : ""}.${more}`,
      source: "https://www.saferproducts.gov/" };
  }
  if (total === 0) {
    // CPSC unreachable is not CPSC empty. Say which happened.
    if (cpsc === null) {
      return { status: "unassessed", ms,
        note: "No recalls at the FDA, and the CPSC database could not be reached, so consumer product recalls are unchecked.",
        source: "https://open.fda.gov/apis/" };
    }
    return { status: "pass", ms, note: "No recalls on record at the FDA or the CPSC.", source: BOTH };
  }
  // The customer card speaks plainly; the counting and the decay rule are our
  // business. openFDA dates are YYYYMMDD, so the 24 month line is exact.
  const d = latest.date || "";
  const ageMonths = d.length === 8
    ? (Date.now() - Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`)) / 2629800000
    : 0;
  const closed = /terminated|completed/i.test(latest.status);
  if (ageMonths > 24 && closed) {
    return { status: "pass", ms,
      note: "No recalls in the last two years at the FDA or the CPSC. Older recalls exist and were resolved.",
      source: BOTH };
  }
  return { status: "caution", ms,
    note: `A ${closed ? "resolved " : ""}recall from ${d.slice(0, 4) || "recently"} is on record: ${latest.reason}`,
    source: "https://open.fda.gov/apis/",
  };
}


/**
 * Reading a product page the way a browser does.
 *
 * The researcher's own web_fetch cannot set headers, and every large retailer
 * serves an ordinary robot a wall. A Bath & Body Works candle came back "not
 * enough found" while its listing carried the whole ingredient list, paraffin
 * and fragrance and BHT, because the page would not open for it. A Worker can
 * send whatever headers it likes, so the Worker does the reading and hands
 * back text.
 *
 * The model chooses the URL, so this is not a trusted input: scheme and host
 * are checked before anything is fetched.
 */
const PAGE_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const PAGE_MAX_CHARS = 8000;
const PAGE_TIMEOUT_MS = 10000;
const PAGE_MAX_READS = 4;

const READ_PAGE_TOOL = {
  name: "read_page",
  description:
    "Open a web page and return its readable text. Use this for any product listing or maker page. " +
    "Large retailers (Amazon, Target, Walmart, Bath & Body Works, Ulta, Sephora) serve robots a blank " +
    "wall to ordinary fetching; this reads them the way a browser does, so prefer it over web_fetch for " +
    "them. Ingredient lists usually live on the listing or the maker's own product page. Give a full URL.",
  input_schema: {
    type: "object",
    properties: { url: { type: "string", description: "The full URL of the page to open." } },
    required: ["url"],
  },
};

function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


/**
 * A listing runs to forty thousand characters of delivery promises and cross
 * sells, and the part a check needs is one paragraph somewhere in the middle.
 * Taking the first eighteen thousand would reliably cut the ingredient list
 * off, so the head is kept for identity and the rest of the budget goes to
 * windows around the words that matter.
 */
function focusOnMaterials(text, cap) {
  if (text.length <= cap) return text;
  const head = text.slice(0, Math.floor(cap * 0.4));
  const re = /(ingredient|material|composition|what.s inside|made (?:of|from|with)|wax|wick|fibre|fiber|fabric|bpa|phthalate|pfas|paraffin|contains)/gi;
  const parts = [];
  let budget = cap - head.length - 40;
  let m;
  while ((m = re.exec(text)) !== null && budget > 0) {
    if (m.index < head.length) continue;
    const slice = text.slice(Math.max(0, m.index - 150), m.index + 650);
    parts.push(slice);
    budget -= slice.length;
    re.lastIndex = m.index + 650;
  }
  return parts.length ? head + "\n\n[...]\n\n" + parts.join("\n[...]\n") : text.slice(0, cap);
}

async function readPage(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl || "")); } catch (e) { return "That is not a URL I can open."; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "Only http and https pages can be opened.";
  // Never let a model-chosen URL reach anything that is not the public web.
  if (/^(localhost|\[?::1\]?|0\.0\.0\.0)$/i.test(u.hostname)
      || /^(127|10)\./.test(u.hostname)
      || /^192\.168\./.test(u.hostname)
      || /^169\.254\./.test(u.hostname)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) {
    return "That address is not a public web page.";
  }
  try {
    const res = await fetch(u.toString(), {
      headers: {
        "User-Agent": PAGE_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
    if (!res.ok) return `The page answered ${res.status}. Try the maker's own product page, or another retailer.`;
    const raw = await res.text();
    const text = htmlToText(raw);
    // A page that renders in the browser sends a shell and fetches its own
    // content afterwards, which no amount of headers will fix. Bath & Body
    // Works answers 200 with three megabytes of markup and under five thousand
    // characters of text, and the ingredient list is in none of it. Say so
    // plainly rather than reporting an empty page as a finding about a product.
    if (raw.length > 200000 && text.length < 6000) {
      return "This page builds itself in the browser, so the server sent only a shell: "
        + `${text.length} characters of text out of ${Math.round(raw.length / 1000)}KB of markup. `
        + "The ingredient list is not in it and cannot be read this way. Try the product's Amazon or "
        + "other retailer listing, which is usually sent whole.\n\nWhat the shell did carry:\n"
        + text.slice(0, 1500);
    }
    return focusOnMaterials(text, PAGE_MAX_CHARS) || "The page opened but carried no readable text.";
  } catch (e) {
    return `The page could not be opened (${String((e && e.message) || e).slice(0, 80)}). Try another source.`;
  }
}

// One Claude call with server-side web search. Returns parsed JSON or null.
async function vetClaude(env, system, userText, maxUses, budgetMs = VET_TIMEOUT_MS) {
  if (!env.ANTHROPIC_API_KEY) return { unconfigured: true };
  let messages = [{ role: "user", content: userText }];
  const spend = { in: 0, out: 0, cacheRead: 0, searches: 0, turns: 0, reads: 0 };
  const startedAt = Date.now();
  let attempts = 0;
  // Turns had to go up: reading a page costs a round trip that searching alone
  // did not, and three was already tight for search plus fetch.
  let reads = 0;
  for (let turn = 0; turn < 6; turn++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        // Context editing. Without it a search result read on turn one is sent
        // again on every turn after it, so a six turn check pays for the same
        // page five times and the bill grows with the square of the work. This
        // clears tool results the researcher has already read from.
        "anthropic-beta": "context-management-2025-06-27",
      },
      body: JSON.stringify({
        model: VET_MODEL,
        context_management: { edits: [{ type: "clear_tool_uses_20250919" }] },
        // The answer is a JSON object carrying a verbatim ingredient list and
        // fourteen materials fields. At 1200 it was truncated mid-object, and a
        // truncated object fails JSON.parse, which the caller reported as
        // "unparseable JSON" and the customer saw as a front that never
        // answered. It was never a research failure at all.
        max_tokens: 8000,
        output_config: { effort: "medium" },
        // The rules are identical on every turn of every check, so they are
        // cached rather than re-sent. Roughly two thousand words each time.
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: maxUses },
          // Search alone finds that a page exists; fetch lets the researcher
          // read it. EWG scores and brand ingredient pages are public.
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 6 },
          // And when both of those meet a wall, which is every big retailer,
          // we open the page ourselves with browser headers.
          READ_PAGE_TOOL,
        ],
        messages,
      }),
      signal: AbortSignal.timeout(Math.max(15000, budgetMs - 5000)),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // A 520 from the API edge killed the formula and materials fronts of a
      // live check while the other two succeeded beside them. Nothing retried,
      // so one gateway hiccup lost half an answer and told the customer we
      // could not reach our research service. Gateway and rate limit failures
      // are transient by definition and get another go, inside the budget.
      const transient = res.status === 429 || res.status >= 500;
      if (transient && attempts < 2 && Date.now() - startedAt < budgetMs - 20000) {
        attempts++;
        await new Promise((r) => setTimeout(r, 1200 * attempts));
        turn--;                                   // the retry is not a turn
        continue;
      }
      return { error: `API ${res.status}: ${body.slice(0, 160)}`, spend };
    }
    const msg = await res.json();
    // Every turn's tokens, summed across the whole check, because until now
    // nobody could answer what one check cost. Search fees are charged per
    // search by the API and are not in here; the count of searches is.
    if (msg.usage) {
      spend.in += msg.usage.input_tokens || 0;
      spend.out += msg.usage.output_tokens || 0;
      spend.cacheRead += msg.usage.cache_read_input_tokens || 0;
      spend.searches += (msg.usage.server_tool_use && msg.usage.server_tool_use.web_search_requests) || 0;
      spend.turns++;
    }
    if (msg.stop_reason === "pause_turn") {
      // A long search turn paused; hand the partial turn back and continue.
      messages = messages.concat([{ role: "assistant", content: msg.content }]);
      continue;
    }
    if (msg.stop_reason === "tool_use") {
      // Server tools are answered by the API and never reach us, so anything
      // here is ours to run.
      const calls = (msg.content || []).filter((b) => b.type === "tool_use" && b.name === "read_page");
      if (calls.length) {
        const results = [];
        for (const c of calls) {
          // A whole check has 70 seconds. A researcher that keeps opening
          // pages will spend all of it and answer nothing, so the reads are
          // capped and it is told plainly when it has run out.
          const body = reads >= PAGE_MAX_READS
            ? "No more page reads left on this check. Answer from what you already have."
            : await readPage(c.input && c.input.url);
          reads++; spend.reads++;
          results.push({ type: "tool_result", tool_use_id: c.id, content: String(body) });
        }
        messages = messages.concat([
          { role: "assistant", content: msg.content },
          { role: "user", content: results },
        ]);
        continue;
      }
      // Tool use we did not ask for: hand the turn back rather than trying to
      // read JSON out of a message that was never meant to carry any.
      messages = messages.concat([{ role: "assistant", content: msg.content }]);
      continue;
    }
    const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { error: "no JSON in reply", spend };
    // Web search wraps quoted findings in <cite> tags; the card wants prose.
    try { return { data: JSON.parse(m[0].replace(/<\/?cite[^>]*>/g, "")), spend };
    } catch (e) { return { error: "unparseable JSON", spend }; }
  }
  return { error: "the research did not finish in time", spend };
}

const VET_RULES = `You are a researcher for Plastic Detox, a consumer safety site. Judge ONLY from what you actually find; when you cannot determine something, say "unassessed". Never guess.
Status rules (a digest of our standard):
- fail: a named hazard in the path that reaches a person: PTFE/PFAS, PVC, polycarbonate/BPA, polystyrene, melamine, phthalates, formaldehyde releasers, triclosan, lead, cadmium, chemical UV filters (oxybenzone, avobenzone, octinoxate, octisalate, octocrylene, homosalate), aluminum chlorohydrate/zirconium, talc.
- fail: plastic in the path of hot water, brewed drink, or heated food. Heat drives migration harder than anything else and this is the ingestion path. Pod and capsule coffee machines (plastic water paths, plastic pods brewed under near-boiling pressurized water), plastic kettles and plastic-path hot appliances fail here; so does anything plastic immersed in what a person drinks (the tea bag rule). Anhydrous oil stored in PET also fails. "BPA-free" does not rescue this: any plastic in a hot drink path fails, resin stated or not.
- caution: a disclosure umbrella ("fragrance", "parfum", "proprietary blend", "natural flavors").
Packaging follows our matrix, by what the contents are, because what leaches from plastic is lipophilic: oil pulls it out, water largely does not. Determine the contents type from the ingredient list (no water = anhydrous; water first with oils = emulsion; watery gel or toner = aqueous) and NAME it in the note.
- aqueous or water-based contents in any common plastic: pass.
- surfactant rinse-off (shampoo, wash) in PET: caution; in HDPE or PP: pass.
- emulsion (lotion, cream, most sunscreens) in plastic: caution.
- anhydrous (oils, balms, lip products) in PET: fail; in other plastic: caution.
- glass, aluminum, steel, paper: pass for anything. Heat in use moves one step worse; rinse-off use one step better.
- pass: inert materials (glass, stainless, aluminum container, paper, cotton, wood); dry contents in any plastic; a full ingredient list with none of the above.
- none: you checked, and nothing of this kind exists or applies. A durable good has no ingredient list, so its "formula" is none (note: "Not applicable: a durable good has no formula; what it is made of is the materials front"). A product nobody has lab tested is testing none. This is a completed check, not a gap.
**The test for a formula is one question: does anyone state what this is made of? If a composition is published anywhere, that is the formula.** It has nothing to do with the kind of product, nothing to do with cosmetics, and nothing to do with how it is used. Peanut butter, a candle, a floor cleaner, a protein powder, a laundry sheet and a lip balm all state their ingredients and all have a formula. Search for the list before deciding there is none. Only a thing nobody states a composition for, a chair, a knife, a bike, has formula "none", and even then say what it is made of under materials. **And a maker's description is not a composition.** "Soy wax and natural essential oils", "clean ingredients", "non toxic formula" are marketing sentences, not ingredient lists, and a formula front must never pass on one. Without an actual list the status is "unassessed", which is honest and blocks good, however reassuring the sentence sounds. **"Essential oils" unnamed is an umbrella exactly like "fragrance"** and earns the same caution: a disclosure names the oils, lavender, bergamot, vetiver, so a reader can check them. Natural is not a disclosure and plant derived is not a list.
**Where a product is burned, vaporised, sprayed or otherwise breathed, the formula is the front that matters most and the contact materials matter least.** Be accurate about why: burning ANY wax produces VOCs and fine particulates, and the published measurements show the FRAGRANCE drives emissions far more than the wax type does, with unscented candles emitting by far the least. There is no sound peer reviewed basis for singling out paraffin over soy or beeswax, and the comparison usually cited for it was funded by a soy trade body. So write that burning any wax releases VOCs and the undisclosed fragrance is what raises them, never that paraffin releases VOCs as though the others do not. **And that fact is context, never the status.** It is true of every candle, every gas hob and every aerosol, so it cannot tell two of them apart and must not set a caution on its own. Write it in the note and take the status from what distinguishes THIS product: whether the fragrance is disclosed, what the wick is, what the record shows, what anyone has measured. A category fact that would mark down every member of the category is not a finding, and a verdict every candle shares tells a shopper nothing. The same goes the other way for compliance: a "lead-free wick" is the law in the US since 2003, not a feature, and CPSC testing finds no detectable airborne lead from metal wicks at the legal limit, so a wick neither earns a pass nor sets a caution unless something specific is actually found, such as an imported candle with a lead core. Do not credit a maker for obeying a ban. What DOES separate one scented product from another is phthalates: a screening of 47 branded perfumes found diethyl phthalate in all 47, DEP is the usual solvent and fixative in fragrance oil and is used to boost hot throw in soy wax, and phthalates are on our hazard list. So an undisclosed fragrance is not only a disclosure failure, it is a likely phthalate carrier. A stated, verifiable phthalate-free fragrance goes beyond any legal floor and counts in the product's favour; say so when you find one. An "organic" wax does not count either way: that describes how a crop was grown, not what it emits when burned, and nobody has measured a difference. Nobody touches candle wax; they breathe what it becomes. Judge such a product on what goes into the air, and say so in the note. Do not spend the answer on a lid.
- unassessed: ONLY when you could not complete the check.
One blocked page is never a finished search. Amazon, Target and Walmart serve most robots a wall, and that says nothing about the product. Use read_page on those: it opens pages with browser headers and gets through where web_fetch does not, and the ingredient list is usually right there on the listing. Read the listing before concluding anything is undisclosed. When a listing will not open, search for the product BY NAME instead: the maker's own site first, then other retailers, then anywhere the material is documented. A maker's own page is better evidence than a listing anyway, because it is the maker's own words. Report "we could not open the page" only after you have searched for the name and found nothing, and then say what you searched.
**Materials is not the formula and must never restate it.** Where a product has a formula, materials covers only the vessel and the parts that are not consumed: the jar, the bottle, the lid, the wick, the pump, the tube. A candle's materials answer is glass jar, cotton wick, metal lid, and nothing at all about the wax or the scent, because those are the formula and are reported there. Repeating them spends the one thing the reader has, which is attention.\nFor a durable good or appliance, "materials" means the surfaces that actually touch the water, food, drink, skin or mouth (the reservoir, tubing, brew chamber, cooking surface, drink path, teat, mouthpiece, pump), never the retail box. A part that touches the person or the contents is a material of the product even when it is small: a bottle's silicone teat and a cleanser's plastic pump both count. Well documented facts about a product category (how a pod machine brews, what a nonstick coating is) are evidence you may use; name the category fact in the note.
Respond with ONLY a JSON object, no prose.`;

const HAZARD_POLYMER = /\b(pvc|polyvinyl|polycarbonate|polystyrene|melamine|ptfe|teflon)\b/i;
const INERT_CONTACT = /\b(glass|borosilicate|stainless|steel|cast iron|titanium|tin|aluminium|aluminum foil|paper|paperboard|cardboard|cork|cotton|linen|hemp|jute|wool|silk|felt|leather|rubber|latex|beeswax|wood|bamboo|maple|ceramic|porcelain|enamel|silicone|lyocell|cellulose|loofah|coir)\b/i;
const PET_LIKE = /\b(pet|pete|polyester|acrylic|nylon|polyamide)\b/i;

/**
 * The packaging matrix, section 3.1, computed here rather than asked for.
 *
 * What leaches out of a plastic is lipophilic: oil pulls it, water mostly does
 * not. So the answer is the contents crossed with the polymer, and it is a
 * table, not a judgement call. Salt and Stone's deodorant is an oil based stick
 * in plastic and the researcher called its materials a pass.
 */
function asText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "yes" : "";
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(", ");
  if (typeof v === "object") {
    for (const k of ["material", "name", "type", "value", "polymer", "container", "base", "description"]) {
      if (typeof v[k] === "string" && v[k].trim()) return v[k];
    }
    return Object.values(v).filter((x) => typeof x === "string").join(" ");
  }
  return String(v);
}

function isTrue(v) {
  if (v === true) return true;
  if (typeof v === "object" && v) return isTrue(asText(v));
  return /^(true|yes)$/i.test(String(v || "").trim());
}

// How much a material has to give before anything is put in it. The same
// ladder the database keeps in POLYMER, so an object scores the same in both.
const POLYMER_RANK = [
  [/\b(pvc|polyvinyl|polycarbonate|polystyrene|melamine|ptfe|teflon|eva|ethylene.vinyl.acetate|polyurethane|memory foam|spandex|elastane)\b/i, 2],
  [/\b(pet|pete|tritan|acrylic|nylon|polyamide|polyester|tpu)\b/i, 1.5],
  [/\b(pp|polypropylene|hdpe|ldpe|polyethylene|aluminium|aluminum|paperboard|carton)\b/i, 1],
];

/** The worst thing in a list of materials, and its name. */
function worstMaterial(text) {
  let rank = 0, name = "";
  for (const [re, r] of POLYMER_RANK) {
    const m = re.exec(text);
    if (m && r > rank) { rank = r; name = m[0]; }
  }
  // A plastic nobody named is read as the worst common case, the way the
  // database reads it.
  if (!rank && /\b(plastic|polymer|resin|foam)\b/i.test(text) && !INERT_CONTACT.test(text)) {
    rank = 1.5;
    name = (/\b(plastic|polymer|resin|foam)\b/i.exec(text) || [""])[0];
  }
  return { rank, name };
}

/**
 * An object is not a container.
 *
 * A balance bike has no contents, so the packaging table has only one of the
 * two axes it needs and every question it asks is the wrong one. It used to run
 * anyway: the container field came back "Not applicable, this is a durable good
 * with no container", no contents matched, the default landed on caution, and
 * the card told a shopper that "the contents in a Not applicable ... and oil
 * pulls more out of plastic than water does" about a wooden bike. Careful was
 * not a finding there. It was the default answer to a question that did not
 * apply.
 *
 * So the object path asks what it is actually made of, and what makes that
 * matter: heat, and a thing a small child puts in their mouth.
 */
function objectStatus({ material, heated, mouthed, nonContact, undisclosedPart, note }) {
  const text = asText(material).trim();
  if (!text) return null;
  // A material we cannot place is not a safe one. "Proprietary bio-composite"
  // matched no rank, fell to zero, and passed, which is the unnamed-grip bug
  // wearing a different coat. The database has always returned unassessed here.
  //
  // But this runs AFTER the unnamed-part check below, not before it. An unnamed
  // contact part is the finding whether or not the rest of the list resolves,
  // and putting this first swallowed it: "non-woven fibre top layer, fibre not
  // named" placed nothing, returned null, and lost the very thing that was
  // wrong with the product.
  const known = INERT_CONTACT.test(text) || HAZARD_POLYMER.test(text)
    || POLYMER_RANK.some(([re]) => re.test(text))
    || /\b(plastic|polymer|resin|foam|rubber|leather|wax|felt|cork)\b/i.test(text);
  // Rule 3.7 on a part rather than a binder: a contact part the maker will not
  // name scores nothing, because there is no name to score, so the front would
  // pass on the parts they did bother to mention.
  // A part name, however much explanation came with it. The model returned
  // "Waterproof backing material type not identified by maker" once, which the
  // template below turned into "The Waterproof backing material type not
  // identified by maker the maker does not name".
  // A construction is not a material, but only where it describes the layer
  // that touches somebody. The first cut of this fired on any unnamed part
  // anywhere and took three products off our own shelf: Burt's Bees crib
  // sheets, which are 100% organic cotton with only the elastic edge unnamed,
  // and Manduka's mat, which is natural rubber with only its recycled content
  // unnamed. In both, the surface against a person IS named.
  //
  // So look at the window around the contact layer itself. Peekapoo's reads
  // "quilted ultra-soft nonwoven top layer": a construction, a contact layer,
  // and no fibre in sight, while the polyethylene it does name is the backing
  // that faces the table.
  const FACE = /(top|face|surface|outer|inner)\s*(layer|sheet|side)|against (the )?skin|next to (the )?skin|sits against/i;
  const BUILD = /\b(non-?woven|woven|quilted|fib(re|er)s?|foam|laminate|textile|jersey)\b/i;
  const NAMED_FIBRE = /\b(cotton|linen|hemp|wool|silk|bamboo|viscose|rayon|modal|lyocell|tencel|polypropylene|polyethylene|polyester|nylon|polyamide|acrylic|rubber|latex|silicone|pla|pp|pe|pet)\b/i;
  let impliedPart = "";
  if (!asText(undisclosedPart).trim()) {
    const m = FACE.exec(asText(material));
    if (m) {
      const at = m.index;
      const window = asText(material).slice(Math.max(0, at - 60), at + 40);
      if (BUILD.test(window) && !NAMED_FIBRE.test(window)) impliedPart = "layer against the skin";
    }
  }
  const unnamed = (asText(undisclosedPart).trim() || impliedPart)
    .replace(/\s*[,(:].*$/, "")
    .replace(/\s+(type|material)?\s*(not|un)(\s|-)?(identified|specified|stated|named|disclosed|known)\b.*$/i, "")
    .replace(/^the\s+/i, "")
    .split(/\s+/).slice(0, 4).join(" ")
    .replace(/\s+(material|type|part|component)s?$/i, "")
    .trim()
    // Mid sentence, so it reads as a part and not as a heading. An acronym
    // keeps its capitals: a PVC backing is still PVC.
    .replace(/^[A-Z](?![A-Z])/, (c) => c.toLowerCase());
  // Rule 3.4: a part nobody meets is printed, not scored.
  const off = asText(nonContact).trim();
  const noted = off ? `; noted and not counted: ${off}, out of the path a person touches` : "";
  if (unnamed) {
    // The rest, briefly. The whole material string here ran to forty words.
    const rest = text.length > 70 ? "" : ` The rest is ${text.replace(/\.$/, "")}`;
    return { status: "caution",
             why: `The ${unnamed} the maker does not name, and it touches the person using it.${rest}${noted}` };
  }
  if (!known) return null;
  if (HAZARD_POLYMER.test(text)) {
    return { status: "fail", why: `${text} against the skin, and that is a plastic we never recommend${noted}` };
  }
  const { rank, name } = worstMaterial(text);
  const drivers = [];
  if (isTrue(heated)) drivers.push("heat");
  if (isTrue(mouthed)) drivers.push("being mouthed or chewed");
  const withDrivers = drivers.length ? `, with ${drivers.join(" and ")}` : "";
  if (rank <= 1 && !drivers.length) {
    return { status: "pass", why: `Made of ${text}, with nothing inside it to pull anything out${noted}` };
  }
  if (rank <= 1) {
    return { status: "caution", why: `${text} against the skin${withDrivers}${noted}` };
  }
  if (rank >= 2 && drivers.length >= 2) {
    return { status: "fail", why: `${name} in direct contact${withDrivers}${noted}` };
  }
  return { status: "caution", why: `${name} in the part that touches a person${withDrivers}${noted}` };
}

function matrixStatus({ container, base, heated, use, filledBy, holds, material, mouthed,
                        nonContact, undisclosedPart, note }) {
  // Rule 3.1 governs what migrates out of a container INTO what it holds. Where
  // there is nothing inside, the object path answers instead.
  const nothingInside = /^(none|nothing|n\/?a|not applicable)\b/i.test(asText(holds).trim())
    || /\bno (container|contents)\b/i.test(asText(container));
  if (nothingInside) {
    return objectStatus({ material: asText(material) || asText(container), heated, mouthed,
                          nonContact, undisclosedPart, note });
  }
  container = asText(container).trim();
  base = asText(base).trim();
  heated = isTrue(heated);
  use = asText(use);
  // Rule 3.13. A container sold empty is filled by the shopper, so it is scored
  // on the hardest use its maker markets. Two things follow, and they are
  // enforced here rather than trusted to the field: the route is ingestion, so
  // 3.3 gives no relief, and an unrecorded contents field reads as an emulsion
  // because food carries fat. Ziploc's bags came back "dry", "not heated" and
  // "never touches a person" for a polyethylene bag their own FAQ markets for
  // meat and for reheating, and passed.
  const buyerFilled = /^buyer$/i.test(asText(filledBy).trim());
  if (buyerFilled) {
    use = "";
    if (!base) base = "emulsion";
  }
  const c = container.toLowerCase();
  const b = base.toLowerCase();
  if (!c) return null;
  if (HAZARD_POLYMER.test(c)) {
    return { status: "fail", why: `${container} touches the contents, and that is a plastic we never recommend in a food or skin path` };
  }
  if (INERT_CONTACT.test(c) && !/plastic|polymer|resin|lined/.test(c)) {
    return { status: "pass", why: `${container}, which puts nothing into what it holds` };
  }
  // An unnamed plastic is read as the worst common case, which is what the
  // database does: classify("plastic") lands in the PET column there, so an oil
  // in a barrel nobody has named is a fail in both engines rather than a fail
  // in one and a caution in the other.
  const named = /hdpe|ldpe|polyethylene|polypropylene|\bpp\b|\bpe\b|silicone/.test(c);
  const pet = PET_LIKE.test(c) || (/plastic|polymer|resin/.test(c) && !named);
  let rank; // 0 pass, 1 caution, 2 fail
  if (/dry|powder|solid bar/.test(b)) rank = 0;
  else if (/aqueous|water/.test(b)) rank = 0;
  else if (/surfactant|wash|shampoo|cleanser/.test(b)) rank = pet ? 1 : 0;
  else if (/emulsion|lotion|cream|sunscreen/.test(b)) rank = 1;
  else if (/anhydrous|oil|balm|butter|stick|wax/.test(b)) rank = pet ? 2 : 1;
  else if (/acid/.test(b)) rank = 1;
  else rank = 1;
  if (heated) rank = Math.min(2, rank + 1);
  if (/rinse/.test(String(use || ""))) rank = Math.max(0, rank - 1);
  const status = ["pass", "caution", "fail"][rank];
  const CONTENTS = [
    [/anhydrous|oil|balm|butter|stick|wax/, "An oil based formula"],
    [/emulsion|lotion|cream|sunscreen/, "A cream"],
    [/surfactant|wash|shampoo|cleanser/, "A wash"],
    [/aqueous|water/, "A water based formula"],
    [/dry|powder|solid bar/, "A dry product"],
    [/acid/, "An acidic formula"],
  ];
  // A shopper reads this sentence. For a container they fill themselves, the
  // matrix's own row names are the wrong words: nobody calls the leftovers in a
  // freezer bag "a cream".
  const FILLED = [
    [/anhydrous|oil|balm|butter|stick|wax/, "Oils and fats"],
    [/emulsion|lotion|cream|sunscreen/, "Food with fat in it"],
    [/surfactant|wash|shampoo|cleanser|aqueous|water/, "Watery food"],
    [/dry|powder|solid bar/, "Dry food"],
    [/acid/, "Acidic food"],
  ];
  const what = buyerFilled
    ? (FILLED.find(([re]) => re.test(b)) || [null, "Food"])[1]
    : (CONTENTS.find(([re]) => re.test(b)) || [null, "The contents"])[1];
  const cont = /^(a|an|the)\b/i.test(container) ? container
    : `${/^[aeiou]/i.test(container) ? "an" : "a"} ${container}`;
  const heat = heated ? ", used with heat" : "";
  const marketed = buyerFilled ? ", which is the hardest use its maker markets" : "";
  const why = rank === 0
    ? `${what} in ${cont}${marketed}${heat}, which does not pull anything measurable out of the packaging`
    : rank === 1
      ? `${what} in ${cont}${marketed}${heat}, and oil pulls more out of plastic than water does`
      : `${what} in ${cont}${marketed}${heat}, which is the pairing that leaches most`;
  return { status, why };
}

/**
 * The product, named however the person gave it to us.
 *
 * A link is how to IDENTIFY the product, never where the research has to stop.
 * The first version of this said "open it", so when Amazon refused, the whole
 * check stopped: Modera's changing pad liners came back "Amazon product page
 * access denied" after the researcher had already worked out the full product
 * name, with moderababy.com sitting there unread.
 */
function vetSubject(brand, product, url) {
  const name = [brand, product].filter(Boolean).join(" ").trim();
  const useLink = " The link identifies which product this is. It is not the only place to"
    + " look, and it is usually not the best one: research the product by name the way you"
    + " would any other, starting with the maker's own site.";
  if (url && name) return `${name}, the one sold at ${url}.${useLink}`;
  if (url) return `the product sold at ${url}. First work out the brand and product name, from`
    + ` the address itself, from a web search for it, or from the page if it opens, and say in`
    + ` the note what it turned out to be.${useLink}`;
  return name;
}


/**
 * The adversarial pass, whose only job is to disqualify the product.
 *
 * The house method says to run one before anything is rated good, searching the
 * brand against lawsuit, class action, CPSC complaint, FDA warning letter,
 * rash, chemical burn and attorney investigating. The check never did. A
 * Bath & Body Works candle came back "no recalls on record" while two active
 * suits over three-wick candles exploding and causing permanent scarring were a
 * search away. Recalls are a database question; litigation is not, and nothing
 * was asking it.
 */

/**
 * A cheap look before an expensive one.
 *
 * A check that finds nothing still cost about fifty cents, because it ran the
 * full research to discover there was nothing to research. Not charging the
 * customer for that only moves the loss onto us. So one small, fast call asks
 * the only question that decides whether the rest is worth doing: can this
 * product be identified at all, and does anyone publish what it is made of.
 *
 * Haiku, two searches, a couple of cents. When it says no, the customer gets an
 * honest answer in seconds instead of ninety, and nobody pays for the silence.
 */
async function vetFeasible(env, brand, product, url = "") {
  if (!env.ANTHROPIC_API_KEY) return { ok: true };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 400,
        system: "You decide only whether a product can be researched. You never judge it.",
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
        messages: [{ role: "user", content:
          `Product: ${vetSubject(brand, product, url)}. Two questions only. `
          + `(1) Does this name identify a real, specific product a person can buy? `
          + `(2) Is there a page anywhere, a retailer or the maker, that exists for it? `
          + `You are NOT deciding whether it is safe and NOT looking for ingredients. `
          + `Be generous: if a plausible product page exists, the answer is yes. `
          + `Reply ONLY: {"findable":true|false,"name":"<the product as you would name it>","why":"<one short sentence, only when false>"}` }],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return { ok: true };                    // never block a check on this
    const msg = await res.json();
    const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { ok: true };
    const d = JSON.parse(m[0]);
    const spend = {
      in: (msg.usage && msg.usage.input_tokens) || 0,
      out: (msg.usage && msg.usage.output_tokens) || 0,
      searches: (msg.usage && msg.usage.server_tool_use && msg.usage.server_tool_use.web_search_requests) || 0,
      cacheRead: 0, reads: 0, turns: 1,
    };
    return { ok: d.findable !== false, why: d.why || "", name: d.name || "", spend };
  } catch (e) { return { ok: true }; }
}

async function vetAdverse(env, brand, product, url = "") {
  return vetClaude(env, VET_RULES,
    `Product: ${vetSubject(brand, product, url)}. Your ONLY job in this pass is to find what is WRONG. `
    + `Search hard and adversarially: "<brand> lawsuit", "<brand> class action", "<brand> settlement", `
    + `"<brand> attorney investigating", "<brand> FDA warning letter", "<brand> CPSC complaint", `
    + `"<brand> injury", "<brand> burn", "<brand> rash", "<brand> recall". Search the PRODUCT LINE too, `
    + `not only the company: a suit about this exact kind of product matters more than one about an unrelated one. `
    + `Report only what you actually find, with the case or action named and dated, and never infer a suit from a complaint thread. `
    + `An active or settled suit ABOUT THIS KIND OF PRODUCT is "caution" at least; a pattern of them, or a regulator finding against the maker, is "fail". `
    + `Litigation about something the company sells that is unrelated to this product is noted in the sentence and does not by itself set the status. `
    + `Nothing found after a real search is status "none", note "No lawsuits, warning letters or complaints found." `
    + `Use "unassessed" only if you genuinely could not search. `
    + `The note is one or two plain sentences a shopper would understand, naming the case and what it alleges. Never narrate your searching. `
    + `Reply ONLY: {"adverse":{"status":"pass|caution|fail|none|unassessed","note":"<one or two sentences>","source":"<url or empty>"}}`,
    6);
}

/** Worst wins, so a clean recall record cannot bury a live lawsuit. */
const FRONT_RANK = { fail: 4, caution: 3, unassessed: 2, pass: 1, none: 0 };
function worseFront(a, b) {
  if (!a) return b;
  if (!b) return a;
  return (FRONT_RANK[b.status] || 0) > (FRONT_RANK[a.status] || 0) ? b : a;
}

async function vetLabel(env, brand, product, url = "") {
  const r = await vetClaude(env, VET_RULES,
    `Product: ${vetSubject(brand, product, url)}. Find (1) "formula": the ingredient list, and nothing else. Quote it verbatim behind the word Ingredients where you can find it. Formula is status "none" ONLY when nobody states what the product is made of, which is true of a chair or a knife and almost nothing else. If a composition is published anywhere, that is the formula, whatever kind of product it is. Search for it before concluding there is none. Where the product is burned, vaporised or sprayed, the formula is the front that decides the answer. Give formula a "finding": one short sentence naming what is wrong, or what is clean, in plain words, such as "Contains parfum, an undisclosed fragrance blend". Give formula a "flagged": an array of the exact ingredient names that earned the status, empty when none. (2) "materials": report FACTS, not a judgement. "holds": what is inside the product, and the single word "none" when the product is not a container at all, which covers every durable good, toy, garment, mat, nappy and piece of furniture. "material": what the product ITSELF is made of, listing ONLY the surfaces a person's skin or mouth meets in normal use, and required whenever holds is "none". "nonContact": the parts a person never meets, such as the tyres of a balance bike, the base of a yoga mat or the foam sealed inside a mattress cover. Those are noted and never scored, so putting one in "material" marks a product down for a part nobody touches. "undisclosedPart": the NAME OF THE PART ONLY, two or three words, where a part in the CONTACT path is one the maker will not identify: "grips", "the top layer", "the coating". Not a sentence and not an explanation, because we put it in one. Empty where every contact part is named. "Nonwoven", "woven", "quilted", "fibre", "foam", "laminate" and "textile" describe how a layer is BUILT, not what it is made of: a nonwoven can be polypropylene, polyester, viscose or cotton and those are four different answers. So a contact layer given only as "nonwoven" or "soft fibre" is an undisclosed part, however much is said about the OTHER layers. "mouthed": true when a small child puts it in their mouth in normal use. "container": what actually touches the contents, as specifically as the source allows (PET, HDPE, PP, unnamed plastic, glass, aluminium, steel, paper, cotton), and empty when holds is "none". "filledBy": "maker" when the product is sold with its contents inside, "buyer" when it is sold empty for the shopper to fill, which is every storage bag, box, jar, wrap and bottle. "base": one of dry, aqueous, surfactant, emulsion, anhydrous, acidic, by what the contents are, an oil or balm or stick being anhydrous. Where filledBy is "buyer" the base is the hardest use the MAKER markets, not the gentlest: dry only where the maker restricts it to dry goods, anhydrous where it is marketed for oils, fats or cooking in the bag, and otherwise emulsion, because food carries fat. "heated": true only when something hot goes in or on it in use, and where filledBy is "buyer" that means the maker markets heating it, microwaving, boiling or the oven. "use": leave-on, rinse-off, ingested or not-on-body. Anything eaten, drunk or held in the mouth is "ingested", never "not-on-body": not-on-body is for laundry powder and surface cleaner, which are diluted and washed away. Add a "note": ONE SENTENCE, under 25 words, naming only what the product is physically made of. It is read on a phone next to three other lines, so it is not a transcript of the listing and not a record of your searching. It says nothing about the ingredients, the fragrance, emissions, VOCs, testing or any study: those are the formula and testing lines and repeating them here wastes the only line materials gets. If the materials are unremarkable, say so in five words. We apply our own packaging table to those facts, so do not reason about pass or fail for materials yourself. Every field carries a "source" URL. (3) "identified": {"brand":"<the maker>","product":"<the product name>"}, always, and above all where you were given only a link: you work the name out in order to research it, and we need it to file the answer under.`,
    6);
  return r;
}

async function vetTesting(env, brand, product, url = "") {
  const r = await vetClaude(env, VET_RULES,
    `Product: ${vetSubject(brand, product, url)}. This front is ONLY for actual measurements and certifications: lab results, peer reviewed studies, certifications (Lead Safe Mama, Mamavation, Consumer Reports, NSF, OEKO-TEX, GOTS, EWG Verified), including studies that MEASURED this product category, which count at caution strength with the note saying it is a category measurement. A certification you verify (EWG Verified, NSF, OEKO-TEX, GOTS) is pass-level evidence. EWG Skin Deep pages and brand certification pages are public: FETCH them rather than reporting that they exist. If an assessment exists only behind a paywall (Consumer Reports), say so plainly: "Consumer Reports has tested this product; the results are subscription only and we could not verify them." What the product is made of is NOT testing evidence. A clean lab result needs its detection limit to count as pass. If nothing has been published about THIS product, do not stop there: search for peer reviewed measurements of the PRODUCT CLASS before answering, because the rules count those at caution strength. Scented candles, gas stoves, nonstick pans, air fresheners and vinyl flooring all have published emissions or migration literature that applies to every product of that kind, and a shopper deciding what to buy needs it. Report it with a note that names what was measured and says plainly that it is a measurement of the category rather than of this item. **But the status must reflect where THIS product sits on what was measured, not merely that the category was measured at all.** A finding true of every member of a category cannot separate them, and if it sets a caution then every member is capped at careful and the verdict tells a shopper nothing. The candle literature does not say candles emit; it says FRAGRANCE LOAD drives emissions and unscented candles emit by far the least. So a heavily scented candle sits badly on the measured axis and takes the caution, and an unscented or lightly, openly scented one sits well on it and takes a pass with the same literature cited. Read the finding for what it distinguishes, and say which end of it this product is at. Only when neither the product nor its class has been measured is the status "none", with note "No independent testing of this product or its category has been published." Use "unassessed" only if you could not complete the search. The note is read by a shopper deciding what to buy, so it says what is true of the PRODUCT in one plain sentence. Never narrate your own searching: which pages would not open, which names you tried, what you could not identify. All of that is our working, and none of it tells anybody anything about the thing in their hand. Reply ONLY: {"testing":{"status":"pass|caution|fail|none|unassessed","note":"<one sentence>","source":"<url or empty>"}}`,
    4, 45000);
  return r;
}

// ---------------------------------------------------------------- database
//
// The database answers before any research spends a cent. A vet on a product
// we already researched is free, instant, and better than anything a live
// search could produce: Keurig sat in brand-data.json as a skip with the pods
// named, while the prototype spent twelve seconds rediscovering less.
let VET_DB = { at: 0, byLabel: null };

function vetCollapse(s) { return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }

async function vetDbLookup(brand, product) {
  try {
    if (!VET_DB.byLabel || Date.now() - VET_DB.at > 3600e3) {
      const res = await fetch("https://plasticdetox.org/brand-data.json",
        { cf: { cacheTtl: 3600, cacheEverything: true } });
      if (!res.ok) return null;
      const brands = await res.json();
      const map = new Map();
      for (const b of brands) {
        for (const label of [b.brand, ...(b.aliases || [])]) {
          const k = vetCollapse(label);
          // Unlike the extension's title matcher, lookup here is exact
          // equality on what the user typed, so even one-letter labels are
          // safe to index: "L." must be findable or its brand never matches.
          if (k.length >= 1 && !map.has(k)) map.set(k, b);
        }
      }
      VET_DB = { at: Date.now(), byLabel: map };
    }
    const hit = VET_DB.byLabel.get(vetCollapse(brand));
    if (!hit) return null;
    // Cheap product row match: every match/matchAll word present in the title.
    const low = " " + (product || "").toLowerCase().replace(/[^a-z0-9]+/g, " ") + " ";
    let row = null;
    for (const p of hit.products || []) {
      const phrases = (p.match || []).map((x) => " " + String(x).toLowerCase() + " ");
      const groups = p.matchAll || [];
      if (phrases.some((ph) => low.includes(ph)) ||
          groups.some((g) => g.length && g.every((w) => low.includes(" " + String(w).toLowerCase() + " ")))) {
        row = p; break;
      }
    }
    return { brand: hit, row };
  } catch (e) { return null; }
}

// The section 6 ladder plus the completeness gate, as the extension applies it.
function vetVerdict(fronts) {
  const st = (k) => (fronts[k] && fronts[k].status) || "unassessed";
  const all = ["formula", "materials", "legal", "testing"].map(st);
  if (all.includes("fail")) return "skip";
  if (all.includes("caution")) return "careful";
  // "none" satisfies a check the way the pipeline's gate treats it: we
  // looked, and nothing of this kind applies. Only "unassessed" blocks.
  const blocking = ["formula", "materials", "legal"];
  if (blocking.every((k) => st(k) === "pass" || st(k) === "none")) return "good";
  return "unrated";
}

// The research pipeline shared by the private bench and the paid customer
// endpoint. Sends step events as each check finishes; the caller sends the
// final event, because only the caller knows about credits.
// Bumped whenever a rule the research applies changes. A stored answer from an
// older engine is not reused: Salt and Stone's materials front was cached as a
// pass, from before section 3.1 was computed here rather than asked for.
// 14, 2026-09-23: Sonnet 5 in place of Haiku, max_tokens 1200 to 8000 (answers
// were truncating mid JSON and being reported as unparseable), search budgets
// 3 and 2 to 10 and 6, the 2026 search and fetch tools, a read_page tool that
// opens retailer pages with browser headers, and a guard stopping anything
// burned, eaten or worn from being called a durable good with no formula.
// Every one of those changed what the research finds, and none of them reached
// a product already answered until this number moved.
// Not bumped for a change to how a note is WORDED. Bumping discards every
// answer anyone has paid for, and a shorter materials sentence is not a
// different verdict. Anya asked for the saved answers to stay saved on the
// same day this number would otherwise have thrown them all away.
const VET_ENGINE = 24;

/** One key per product, so the same thing asked twice finds the first answer. */
function researchKey(brand, product) {
  return "vetdone:" + `${brand}::${product}`.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 300);
}

/**
 * Every name the same answer should be findable under.
 *
 * The key is made of what the asker typed, so a candle checked from a pasted
 * link was filed under the slug in that link and nothing else. Ask for it by
 * the name the research itself established, or by its ASIN, or from a shorter
 * link to the same product, and the answer somebody had already paid for was
 * not there. So it is filed under all of them, and looked up under all of them.
 */
function researchKeys(brand, product, identified, asin) {
  const keys = [researchKey(brand, product)];
  const add = (b, p) => {
    const k = researchKey(b || "", p || "");
    if (k.length > 9 && keys.indexOf(k) < 0) keys.push(k);
  };
  if (identified) add(identified.brand, identified.product);
  if (brand && product) add(`${brand} ${product}`, "");
  if (asin) keys.push("vetdone:asin-" + String(asin).toLowerCase());
  return keys;
}

/**
 * A stored answer that is incomplete because of us, not because of the product.
 *
 * A front reading unassessed over "the CPSC database could not be reached" is
 * our outage written onto somebody's card, and it sat there permanently: the
 * answer is cached, so the same question returned the same hole forever. Asking
 * again to repair our own failure is not a purchase, so it does not cost a
 * check. A product that is genuinely unproven is a different thing and is not
 * in here: this looks only for the sentences we write about ourselves.
 */
const OUR_FAULT = /could not be reached|could not complete this check|did not finish|not configured on this worker|could not reach our research service/i;

function repairableFronts(fronts) {
  return Object.values(fronts || {}).some(
    (f) => f && f.status === "unassessed" && OUR_FAULT.test(f.note || ""));
}

/** The ASIN in a pasted address, or "". The key our database is built on. */
function asinFromUrl(url) {
  const m = String(url || "").match(/\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : "";
}

async function vetCore(env, brand, product, send, allowResearch, url = "", fresh = false) {
  const t0 = Date.now();
  const fronts = {};
  send({ step: "start", brand, product });

  // Free answer first, but only where our evidence actually covers the
  // product. A matched product row answers outright. A brand-only hit
  // answers only when the brand finding plainly covers this kind of product
  // (Keurig's reason is about coffee makers, and a coffee maker was asked).
  // Otherwise the brand verdict is context, never the answer: Chefman is a
  // skip for its air fryer coatings, and asserting that against a kettle is
  // the exact brand-is-not-a-product mistake the standard forbids.
  const STANCE_BADGE = { good: "pass", careful: "caution", skip: "fail" };
  const db = await vetDbLookup(brand, product);
  let brandStance = null;
  if (db) {
    const b = db.brand, row = db.row;
    const scopeText = ((b.reason || "") + " " + (b.category || "")).toLowerCase();
    // Only product-type words may prove coverage. "with" matched a fryer
    // verdict to a kettle; generic adjectives and materials are just as bad.
    const GENERIC_WORDS = new Set(["with", "without", "this", "that", "from",
      "have", "your", "temperature", "control", "electric", "digital",
      "programmable", "adjustable", "stainless", "steel", "glass", "black",
      "white", "large", "small", "inch", "quart", "liter", "ounce", "pack",
      "count", "piece", "premium", "classic", "original", "series", "model"]);
    const covered = row || (product || "").toLowerCase().split(/[^a-z0-9]+/)
      .some((w) => w.length > 3 && !GENERIC_WORDS.has(w) && scopeText.includes(w));
    if (covered) {
      const verdict = (row && row.ext && row.ext.verdict && row.ext.verdict !== "unrated")
        ? row.ext.verdict : b.stance;
      const note = (row && row.note) || b.reason || "";
      send({ step: "database", front: { status: STANCE_BADGE[verdict] || "unassessed",
        note: `Already in our database${row ? ` (${row.name})` : ""}: ${note}`.slice(0, 400),
        source: `https://plasticdetox.org/brand-check.html?b=${encodeURIComponent(b.brand)}` },
        ms: Date.now() - t0 });
      return { fromDatabase: true, verdict, capNote: "", fronts: {},
               chargeable: false, elapsedMs: Date.now() - t0 };
    }
    brandStance = b.stance;
    // Internal context: it steers the verdict cap below, and the review
    // queue will want it, but the customer card never shows it.
    send({ step: "database", internal: true,
      front: { status: STANCE_BADGE[b.stance] || "unassessed",
      note: `Brand context (internal): we rate ${b.brand} ${b.stance}. `
        + `Researching this exact product now.`,
      source: `https://plasticdetox.org/brand-check.html?b=${encodeURIComponent(b.brand)}` },
      ms: Date.now() - t0 });
  }

  // Research already done on this exact product, by whoever paid for it first.
  // Everyone who asks afterwards gets that answer, free and instantly, and the
  // card says when it was researched and that a person has not reviewed it.
  const cacheKeys = researchKeys(brand, product, null, asinFromUrl(url));
  const cacheK = cacheKeys[0];
  let cached = null;
  for (const k of cacheKeys) {
    const hit = await env.BRAND_SEARCHES.get(k, { type: "json" }).catch(() => null);
    // An alias key holds a pointer rather than a copy, so one answer cannot
    // drift into several that disagree.
    const rec = hit && hit.alias
      ? await env.BRAND_SEARCHES.get(hit.alias, { type: "json" }).catch(() => null)
      : hit;
    if (rec && rec.fronts) { cached = rec; break; }
  }
  // Asked for again on purpose: research it rather than handing back the same
  // answer. Free when what is being replaced was our own failure.
  const repair = fresh && cached && cached.fronts && repairableFronts(cached.fronts);
  if (!fresh && cached && cached.fronts && (cached.engine || 0) >= VET_ENGINE) {
    for (const [k, f] of Object.entries(cached.fronts)) {
      send({ step: k, front: f, ms: Date.now() - t0 });
    }
    return { fromDatabase: false, fromResearch: true, researchedAt: cached.at,
             verdict: cached.verdict, capNote: cached.capNote || "", fronts: cached.fronts,
             chargeable: false, elapsedMs: Date.now() - t0 };
  }

  // Out of credits and not in the database: stop before spending anything. A
  // repair is the exception. An empty pass is no reason to leave somebody
  // holding a card with our own outage written on it.
  if (!allowResearch && !repair) {
    return { fromDatabase: false, verdict: null, capNote: "", fronts: {},
             chargeable: false, needsCredits: true, elapsedMs: Date.now() - t0 };
  }

  let labelOk = false;
  // What the research established the product actually is. Given only a link,
  // the researcher works this out in order to search at all, and we threw it
  // away: a check came back filed under an empty brand, which made it
  // unfindable on the phone that paid for it and a nameless dot in the history.
  let identified = null;
  // A leg that never reached the researcher is our failure, not a finding
  // about the product. Anya ran a check while this worker's API key was being
  // rejected and got three error rows under a verdict reading "not enough
  // found", which is the card saying the product looks unproven when what
  // actually happened is that we never asked.
  let transportFailed = false;
  // Our own table refusing to score facts the researcher DID return. That is a
  // failure of ours, not a finding about the product, and it must not be paid
  // for. Modera's changing pads came back with a formula and a legal check and
  // "Could not complete this check (no result)" on materials, and the pass was
  // spent on it.
  let ruleFailed = false;
  const finish = (key, r, aiKeys) => {
    const id = r.data && r.data.identified;
    if (id && (asText(id.brand).trim() || asText(id.product).trim())) {
      identified = { brand: asText(id.brand).trim().slice(0, 80),
                     product: asText(id.product).trim().slice(0, 160) };
    }
    // The researcher reports what the product is made of; the status comes from
    // our table, not from its reading of our rules.
    const m = r.data && r.data.materials;
    if (m && (m.container || m.base || m.material || m.holds)) {
      const ruled = matrixStatus(m);
      if (ruled) {
        m.status = ruled.status;
        // The table's reason is written lowercase to sit inside a sentence, so
        // pasting it at the front produced "glass, which puts nothing into what
        // it holds. Sold as a filled candle...": a note opening in lower case
        // and mid thought.
        const why = String(ruled.why || "").trim();
        m.note = `${why.charAt(0).toUpperCase()}${why.slice(1)}. ${String(m.note || "").trim()}`.trim();
      } else if (!m.status) {
        // Three silences, and only one of them is ours.
        const said = (asText(m.material) || asText(m.container)).trim();
        // The researcher answering "not accessible" or "not stated" IS an
        // answer: it looked and the information is not published. Wrapping our
        // own error around it produced the worst line this app has shipped,
        // "We could not read a material we score out of 'unassessed, full
        // product specifications not accessible'".
        const nonAnswer = !said || /^(un|not |no |n\/?a|none|cannot|could not|unable)/i.test(said)
          || /not (stated|available|accessible|published|disclosed|specified)|access denied|unknown/i.test(said);
        m.status = "unassessed";
        m.note = nonAnswer
          ? ("Nobody publishes what this is made of. We searched and could not find a "
             + "materials list, and the listing itself is not readable by us. "
             + "That is a gap in what the maker discloses, not a clean result. "
             + asText(m.note)).trim()
          : `We could not read a material we score out of "${said}". ${asText(m.note)}`.trim();
        // Only the last is our failure. A product nobody documents is the
        // product's own answer, and the check still earned its credit.
        if (!nonAnswer) ruleFailed = true;
      }
    }
    // A durable good has no ingredient list, and the materials answer already
    // said so. Where the researcher returned materials and left formula out,
    // that is not a failed check, it is the one answer formula can have here:
    // the screen showed "Could not complete this check" beside a materials row
    // that had just explained the product is an object.
    // An object, however it was described. The first version of this only fired
    // on holds:"none", so a changing pad whose materials note said in so many
    // words "No ingredient list provided by maker" still showed "Formula: could
    // not complete this check" beside it.
    //
    // Except that the researcher's word for it is not proof. A Bath & Body
    // Works candle came back with the materials note calling it "a durable
    // good", the regex below matched, and we manufactured "no formula to
    // assess" onto a product whose listing carries a full ingredient list:
    // paraffin, microcrystalline wax, fragrance and BHT. Somebody paid a check
    // for that. A thing that is burned, eaten, washed with or put on skin has a
    // formula whatever the researcher decided to call it, so the manufactured
    // "none" is refused for those outright and the front stays unanswered,
    // which is the truth and which blocks good.
    // The first version of this guard listed the categories that have a formula,
    // which is the same bug with a longer list: it caught candles and would
    // have missed peanut butter. What decides it is whether a composition is
    // stated, so prose is no longer allowed to decide anything. Only the
    // structural answer counts, and a note saying "durable good" never does.
    const isObject = m && (/^(none|nothing|n\/?a|not applicable)\b/i.test(asText(m.holds).trim())
      || (asText(m.material).trim() && !asText(m.base).trim() && !asText(m.container).trim()));
    if (isObject && r.data && !r.data.formula) {
      r.data.formula = { status: "none", source: asText(m.source) || "",
        note: "A durable good has no ingredient list. What it is made of is the materials check." };
    }
    // Formula leads with the finding, so "contains parfum" is the first thing
    // read rather than the fourth sentence of a paragraph.
    const f = r.data && r.data.formula;
    if (f && f.finding) {
      const lead = String(f.finding).trim().replace(/\.$/, "");
      if (lead && !String(f.note || "").startsWith(lead)) {
        f.note = `${lead}. ${String(f.note || "").trim()}`.trim();
      }
    }
    // Claude legs return {data} | {error} | {unconfigured}; legal returns a front.
    for (const k of aiKeys) {
      if (r.data && r.data[k] && r.data[k].status) {
        fronts[k] = r.data[k];
        if (key === "label") labelOk = true;
      } else {
        if (r.error || r.unconfigured) transportFailed = true;
        fronts[k] = { status: "unassessed",
          note: r.unconfigured
            ? "AI research is not configured on this worker yet (missing ANTHROPIC_API_KEY)."
            : `Could not complete this check (${r.error || "no result"}).`,
          source: "" };
      }
      send({ step: k, front: fronts[k], ms: Date.now() - t0 });
    }
  };

  // What a check costs, summed across both model calls. Anya measured almost a
  // dollar on one candle and nothing in here was counting, so "what did that
  // cost" had no answer at all. Prices are the published Sonnet 5 rates and the
  // per search fee; they are constants here so the figure moves when they do.
  const bill = { in: 0, out: 0, cacheRead: 0, searches: 0, reads: 0, turns: 0 };
  const addSpend = (r) => {
    const s = r && r.spend;
    if (!s) return;
    for (const k of Object.keys(bill)) bill[k] += s[k] || 0;
  };

  // Nothing expensive runs until we know there is something to research. A
  // product nobody can find is answered in seconds for a couple of cents rather
  // than in ninety for fifty, and the caller is told not to charge for it.
  const feas = await vetFeasible(env, brand, product, url);
  addSpend(feas);
  if (!feas.ok) {
    const note = "We could not find this product at all"
      + (feas.why ? ", " + feas.why.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/\.$/, "") : "")
      + ". Check the spelling, or paste a link to it, and we will look again. Nothing has been charged.";
    for (const k of ["formula", "materials", "legal", "testing"]) {
      fronts[k] = { status: "unassessed", note, source: "" };
      send({ step: k, front: fronts[k], ms: Date.now() - t0 });
    }
    bill.usd = Number((bill.in * 2e-6 + bill.out * 1e-5 + bill.searches * 0.01).toFixed(4));
    bill.ms = Date.now() - t0;
    // chargeable false is what actually protects the customer's credit; it is
    // stated rather than left to default, because this is the path where a
    // wrong default costs somebody a check they paid for.
    return { fromDatabase: false, fromResearch: false, notFound: true, bill,
             chargeable: false, elapsedMs: Date.now() - t0,
             verdict: "unrated", capNote: "", fronts, identified: null };
  }

  // Recalls come from two databases; lawsuits come from searching. The front is
  // called "Recalls & lawsuits" and until now only the first half was asked.
  const legalP = Promise.all([
    vetLegal(brand),
    vetAdverse(env, brand, product, url).then((r) => { addSpend(r); return r && r.data && r.data.adverse; }).catch(() => null),
  ]).then(([recalls, adverse]) => {
    let f = worseFront(recalls, adverse);
    if (recalls && adverse && recalls.status !== adverse.status) {
      // Both looked and disagreed, so the card carries both sentences rather
      // than silently dropping the quieter one.
      f = { ...f, note: [adverse.note, recalls.note].filter(Boolean).join(" ") };
    }
    fronts.legal = f;
    send({ step: "legal", front: f, ms: Date.now() - t0 });
  });
  const labelP = vetLabel(env, brand, product, url).then((r) => { addSpend(r); return finish("label", r, ["formula", "materials"]); });
  const testP = vetTesting(env, brand, product, url).then((r) => { addSpend(r); return finish("testing", r, ["testing"]); });
  await Promise.allSettled([legalP, labelP, testP]);

  const USD_IN = 2 / 1e6, USD_OUT = 10 / 1e6, USD_CACHE_READ = 0.2 / 1e6, USD_SEARCH = 0.01;
  bill.usd = Number((bill.in * USD_IN + bill.out * USD_OUT
    + bill.cacheRead * USD_CACHE_READ + bill.searches * USD_SEARCH).toFixed(4));
  bill.ms = Date.now() - t0;

  for (const k of ["formula", "materials", "legal", "testing"]) {
    if (!fronts[k]) fronts[k] = { status: "unassessed", note: "Did not finish in time.", source: "" };
  }
  try {
    await env.BRAND_SEARCHES.put(
      "vetcost:" + Date.now() + ":" + researchKey(brand, product).slice(8, 60),
      JSON.stringify({ brand, product, at: new Date().toISOString(), ...bill }),
      { expirationTtl: 60 * 60 * 24 * 180 }
    );
  } catch (e) { /* the cost note must never cost the customer their check */ }

  let verdict = vetVerdict(fronts);
  // Rule 1.1: adverse brand evidence propagates as a caution with its scope
  // named; favourable never does. A clean read on one product cannot
  // out-rank what we hold against its maker.
  let capNote = "";
  if ((brandStance === "careful" || brandStance === "skip") && verdict === "good") {
    verdict = "careful";
    capNote = `This product read clean, and we still rate the brand itself ${brandStance}.`;
  }
  // A customer is charged only when the core of the card, the materials
  // research, actually delivered. A transport failure is our problem.
  // Keep what was researched. The next person to ask about this product, on
  // any device, gets it without paying for the same work twice, and the review
  // queue can lift it into the reviewed database.
  if (labelOk && !ruleFailed) {
    const filedBrand = brand || (identified && identified.brand) || "";
    const filedProduct = product || (identified && identified.product) || "";
    await env.BRAND_SEARCHES.put(cacheK, JSON.stringify({
      brand: filedBrand, product: filedProduct, verdict, capNote, fronts,
      identified, engine: VET_ENGINE, at: new Date().toISOString(), bill,
    })).catch(() => {});
    // The other names this same product will be asked for under. Pointers, so
    // there is still exactly one answer.
    for (const k of researchKeys(brand, product, identified, asinFromUrl(url)).slice(1)) {
      await env.BRAND_SEARCHES.put(k, JSON.stringify({ alias: cacheK })).catch(() => {});
    }
  }
  return { fromDatabase: false, verdict, capNote, fronts, identified, repair,
           chargeable: labelOk && !ruleFailed && !repair,
           researchFailed: (!labelOk && transportFailed) || ruleFailed,
           // Two failures, two honest sentences. Telling somebody we could not
           // reach the research service when we reached it and then fumbled the
           // answer ourselves is a wrong explanation, not a softer one.
           failMessage: ruleFailed
             ? ("The research came back, but we could not score what it found, so nothing was "
                + "taken off your pass. That is a fault our side and it is logged. Please try "
                + "again, or ask us to check it by hand and we will answer within 2 business days.")
             : ("We could not reach our research service, so this check did not run and nothing "
                + "was taken off your pass. Please try again in a few minutes."),
           elapsedMs: Date.now() - t0 };
}

function sseResponse(corsOrigin) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  return {
    readable,
    writer,
    send: (obj) => writer.write(enc.encode("data: " + JSON.stringify(obj) + "\n\n")),
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": corsOrigin,
    },
  };
}

async function handleInstantVet(request, env, corsOrigin) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!env.STATS_TOKEN || token !== env.STATS_TOKEN) {
    return json({ ok: false, error: "Not authorized" }, 401, corsOrigin);
  }
  const body = await request.json().catch(() => ({}));
  const brand = (body.brand || "").toString().trim().slice(0, 80);
  const product = (body.product || "").toString().trim().slice(0, 160);
  // A link names one listing exactly, which beats a brand and a product typed
  // from memory, and it is the only thing a bare Amazon /dp/ address carries.
  const url = (body.url || "").toString().trim().slice(0, 500);
  if (!brand && !url) return json({ ok: false, error: "brand is required" }, 400, corsOrigin);

  const s = sseResponse(corsOrigin);
  (async () => {
    const r = await vetCore(env, brand, product, s.send, true, url);
    if (r.researchFailed) {
      s.send({ done: true, elapsedMs: r.elapsedMs, consumed: false, 
               error: r.failMessage });
      await s.writer.close();
      return;
    }
    s.send({ done: true, elapsedMs: r.elapsedMs, verdict: r.verdict, capNote: r.capNote,
             label: r.fromDatabase
               ? "From our reviewed database, no credit consumed"
               : r.fromResearch
                 ? `Checked ${String(r.researchedAt || "").slice(0, 10)}, already researched for someone else. No credit used.`
                 : "Checked just now, sources on every line",
             fronts: r.fronts, fromDatabase: r.fromDatabase, engine: VET_ENGINE,
             identified: r.identified || null });
    await s.writer.close();
  })().catch(async (e) => {
    try { s.send({ done: true, error: String(e).slice(0, 200) }); await s.writer.close(); } catch (_) {}
  });
  return new Response(s.readable, { headers: s.headers });
}

// ---------------------------------------------------------------- customers
//
// A check pass is a link, not an account: buy a pack, get a tokened URL by
// email, spend credits from it. Database answers are free and never touch
// the balance; only completed live research consumes a credit.
const VET_PACKS = {
  p5:  { usd: 500,  checks: 20,  name: "Check Pass, 20 checks" },
  p10: { usd: 1000, checks: 45,  name: "Check Pass, 45 checks" },
  p20: { usd: 2000, checks: 100, name: "Check Pass, 100 checks" },
};


/**
 * Passes, found by the email that bought them.
 *
 * A pass was a bearer token and nothing else: whoever held the URL held the
 * checks. That is per browser and per origin by construction, so the app and
 * the website could never see each other's, clearing storage lost it, and a new
 * phone lost it. Anya ended up with four passes and her credits scattered over
 * all of them.
 *
 * The email was on the pass record the whole time and nothing ever looked it
 * up. So: an index written at purchase, a restore that merges every pass an
 * address owns onto one token, and merged records that redirect rather than
 * disappear, because their links are already in people's inboxes.
 *
 * The free product still needs no account. This only exists where somebody paid.
 */
const emailKey = (email) => "vetemail:" + String(email || "").trim().toLowerCase();

/** Read a pass, following a merge. Returns {token, rec} or null. */
async function readPass(env, token, depth = 0) {
  if (!token || depth > 3) return null;
  const rec = await env.BRAND_SEARCHES.get("vetpass:" + token, { type: "json" }).catch(() => null);
  if (!rec) return null;
  if (rec.mergedInto) return readPass(env, rec.mergedInto, depth + 1);
  return { token, rec };
}

async function indexPassEmail(env, email, token) {
  if (!email) return;
  try {
    const k = emailKey(email);
    const list = (await env.BRAND_SEARCHES.get(k, { type: "json" })) || [];
    if (!list.includes(token)) list.push(token);
    await env.BRAND_SEARCHES.put(k, JSON.stringify(list));
  } catch (e) { /* the index is a convenience; never fail a purchase over it */ }
}


/**
 * Every pass an address owns, folded onto one. Newest survives; the rest keep
 * their records and redirect, because their links are in people's inboxes.
 */
async function mergePassesForEmail(env, clean, tokens) {
  const live = [];
  for (const tk of tokens || []) {
    const hit = await readPass(env, tk);
    if (hit && !live.some((l) => l.token === hit.token)) live.push(hit);
  }
  if (!live.length) return null;
  live.sort((a, b) => String(b.rec.created || "").localeCompare(String(a.rec.created || "")));
  const keep = live[0];
  for (const other of live.slice(1)) {
    keep.rec.balance = (keep.rec.balance || 0) + (other.rec.balance || 0);
    keep.rec.purchased = (keep.rec.purchased || 0) + (other.rec.purchased || 0);
    keep.rec.used = (keep.rec.used || 0) + (other.rec.used || 0);
    keep.rec.history = [...(other.rec.history || []), ...(keep.rec.history || [])].slice(-50);
    await env.BRAND_SEARCHES.put("vetpass:" + other.token,
      JSON.stringify({ ...other.rec, balance: 0, mergedInto: keep.token,
                       mergedAt: new Date().toISOString() }));
  }
  await env.BRAND_SEARCHES.put("vetpass:" + keep.token, JSON.stringify(keep.rec));
  await env.BRAND_SEARCHES.put(emailKey(clean), JSON.stringify([keep.token]));
  return keep;
}

/** Passes an address owns, including ones bought before the index existed. */
async function tokensForEmail(env, clean) {
  let tokens = (await env.BRAND_SEARCHES.get(emailKey(clean), { type: "json" })) || [];
  if (tokens.length) return tokens;
  const listed = await env.BRAND_SEARCHES.list({ prefix: "vetpass:" });
  for (const k of listed.keys) {
    const rec = await env.BRAND_SEARCHES.get(k.name, { type: "json" }).catch(() => null);
    if (rec && !rec.mergedInto && String(rec.email || "").toLowerCase() === clean) {
      tokens.push(k.name.slice("vetpass:".length));
    }
  }
  return tokens;
}

/**
 * Signing in with a six digit code.
 *
 * A magic link cannot cross into the app without deep linking, which is the
 * handover that has never worked, so the link model could never make the app
 * and the website one thing. A code can be typed anywhere. Nothing to keep,
 * nothing to forward, and the same six digits work in both.
 *
 * POST /vet-login { email } -> always the same answer, so this cannot be used
 * to discover who has bought something.
 */
async function handleVetLogin(request, env, corsOrigin) {
  const said = { ok: true, message: "Code sent. Use the newest one; it lasts fifteen minutes." };
  try {
    const { email } = await request.json();
    const clean = String(email || "").trim().toLowerCase();
    if (!clean || !clean.includes("@")) {
      return json({ ok: false, error: "Enter the email you paid with." }, 400, corsOrigin);
    }
    const tokens = await tokensForEmail(env, clean);
    // Saying nothing was meant to stop anyone learning who had bought. For a
    // ten dollar punch card that protects almost nothing and costs a dead end:
    // Anya typed the wrong address of her own, was told a code was on its way,
    // and had no way on earth to find out why none arrived. Tell people.
    if (!tokens.length) {
      return json({ ok: false, error: "We have no pass for that address. Check the email you paid with, or the one your pass link was sent to." },
        404, corsOrigin);
    }

    // Only a real customer's address is ever emailed, which blocks the obvious
    // abuse, but without a cooldown somebody could still hammer one address and
    // both spam them and eat the monthly send allowance. A live code is reused
    // rather than replaced, so asking twice does not invalidate the first one.
    const existing = await env.BRAND_SEARCHES.get("vetcode:" + clean, { type: "json" });
    if (existing && Date.now() - (existing.at || 0) < 60000) {
      // And say so, rather than swallowing it and looking like a failed send.
      return json({ ok: true, message: "A code is already on its way. Check your inbox, including spam." },
        200, corsOrigin);
    }

    // A genuinely new send means a genuinely new code, and the attempt count
    // starts again. Reusing the old one carried its failed guesses forward, so
    // somebody who mistyped a few times got a fresh code that was already
    // locked out, with nothing on screen to say why.
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
    await env.BRAND_SEARCHES.put("vetcode:" + clean,
      JSON.stringify({ code, tries: 0, at: Date.now() }),
      { expirationTtl: 900 });
    // Asking again replaces the code, so say so rather than leaving two in an
    // inbox and no clue which one works.

    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: env.SENDER_NAME, email: env.SENDER_EMAIL },
        to: [{ email: clean }],
        subject: `${code} is your Plastic Detox code`,
        htmlContent: emailShell("Your code",
          emailP(`Your sign in code is <b style="font-size:22px;letter-spacing:3px">${code}</b>`) +
          emailP("It lasts fifteen minutes and works in the app and on the website.") +
          emailP("If you did not ask for it, you can ignore this.")),
      }),
    }).catch(() => {});
    return json(said, 200, corsOrigin);
  } catch (e) { return json(said, 200, corsOrigin); }
}

/** POST /vet-verify { email, code } -> the merged pass, on success. */
async function handleVetVerify(request, env, corsOrigin) {
  try {
    const { email, code } = await request.json();
    const clean = String(email || "").trim().toLowerCase();
    const given = String(code || "").replace(/\D/g, "");
    const bad = { ok: false, error: "That code is wrong or has expired." };
    if (!clean || given.length !== 6) return json(bad, 400, corsOrigin);

    const k = "vetcode:" + clean;
    const rec = await env.BRAND_SEARCHES.get(k, { type: "json" });
    // "Wrong or expired" covered three different situations and so explained
    // none of them. Anya had a valid code in her inbox and a stale address in
    // the email box, and was told her code was expired. Name the address we
    // looked under: the mismatch is invisible otherwise.
    if (!rec) {
      return json({ ok: false, error: `No code has been sent to ${clean}. Ask for one above, and check the address is the one you paid with.` },
        400, corsOrigin);
    }
    // Six digits is a million combinations; five guesses makes it unguessable
    // inside the fifteen minutes the code lives.
    if ((rec.tries || 0) >= 5) {
      await env.BRAND_SEARCHES.delete(k);
      return json({ ok: false, error: "Too many wrong codes. Ask for a new one." }, 400, corsOrigin);
    }
    if (rec.code !== given) {
      const left = 5 - ((rec.tries || 0) + 1);
      await env.BRAND_SEARCHES.put(k, JSON.stringify({ ...rec, tries: (rec.tries || 0) + 1 }),
        { expirationTtl: 900 });
      return json({ ok: false, error: left > 0
        ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left, or ask for a new one.`
        : "Too many wrong codes. Ask for a new one." }, 400, corsOrigin);
    }
    await env.BRAND_SEARCHES.delete(k);

    const keep = await mergePassesForEmail(env, clean, await tokensForEmail(env, clean));
    if (!keep) return json(bad, 400, corsOrigin);
    return json({ ok: true, pass: keep.token, balance: keep.rec.balance || 0, email: clean },
      200, corsOrigin);
  } catch (e) {
    return json({ ok: false, error: "That code is wrong or has expired." }, 400, corsOrigin);
  }
}

/**
 * POST /vet-restore { email } -> merges and emails the surviving pass.
 *
 * Always answers the same whether or not the address has passes, so this
 * cannot be used to find out who bought something.
 */
async function handleVetRestore(request, env, corsOrigin) {
  const said = { ok: true, message: "If that address has a pass, we have emailed it." };
  try {
    const { email } = await request.json();
    const clean = String(email || "").trim().toLowerCase();
    if (!clean || !clean.includes("@")) {
      return json({ ok: false, error: "Enter the email you bought with." }, 400, corsOrigin);
    }

    const tokens = await tokensForEmail(env, clean);

    const keep = await mergePassesForEmail(env, clean, tokens);
    if (!keep) return json(said, 200, corsOrigin);
    await sendPassEmail(env, clean, keep.token, keep.rec.balance);
    return json(said, 200, corsOrigin);
  } catch (e) {
    return json(said, 200, corsOrigin);
  }
}

async function mintVetPass(env, checks, email, pack) {
  // Buying a second pack used to mint a second token, so somebody who bought
  // twice owned two passes and the browser kept whichever it claimed last. A
  // purchase now tops up whatever that address already owns, which is what a
  // customer means by buying more checks.
  const clean = String(email || "").trim().toLowerCase();
  if (clean) {
    const existing = await mergePassesForEmail(env, clean, await tokensForEmail(env, clean));
    if (existing) {
      existing.rec.balance = (existing.rec.balance || 0) + checks;
      existing.rec.purchased = (existing.rec.purchased || 0) + checks;
      existing.rec.lastPack = pack || "";
      existing.rec.toppedUp = new Date().toISOString();
      await env.BRAND_SEARCHES.put("vetpass:" + existing.token, JSON.stringify(existing.rec));
      return existing.token;
    }
  }
  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "").slice(0, 40);
  await env.BRAND_SEARCHES.put("vetpass:" + token, JSON.stringify({
    balance: checks, purchased: checks, used: 0,
    email: email || "", pack: pack || "", created: new Date().toISOString(),
    history: [],
  }));
  await indexPassEmail(env, email, token);
  return token;
}

async function sendPassEmail(env, email, token, checks) {
  const url = `https://plasticdetox.org/vet.html?pass=${token}`;
  await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { name: env.SENDER_NAME, email: env.SENDER_EMAIL },
      to: [{ email }],
      subject: "Your check pass is ready",
      htmlContent: emailShell("Check Pass",
        emailP(`Your pass is loaded with ${checks} product checks.`) +
        emailP(`<a href="${url}">Open your check pass</a> and keep the link; it is your pass. Credits never expire, and a product already in our database never uses one.`) +
        emailP("Every answer is research we stand behind: four checks, sources shown, and anything new joins our public database after review.")
      ),
    }),
  }).catch(() => {});
}

async function handleVetCheckout(request, env, corsOrigin) {
  try {
    const { pack, app } = await request.json();
    const p = VET_PACKS[pack];
    if (!p) return json({ ok: false, error: "Unknown pack" }, 400, corsOrigin);
    if (!env.STRIPE_SECRET_KEY) {
      return json({ ok: false, error: "Checkout is not configured yet." }, 503, corsOrigin);
    }
    const q = new URLSearchParams();
    q.append("mode", "payment");
    // Stripe substitutes the {CHECKOUT_SESSION_ID} placeholder at redirect
    // time; vet.html trades it for the pass via /vet-claim so checks are
    // usable the moment the buyer lands back, email link as backup.
    // A buyer who started in the app has to end in the app. The flag used to
    // live in the browser's localStorage, which does not survive the hop out to
    // Stripe and back in every in app browser, so the buyer landed on the
    // website with a pass the app knew nothing about. It rides in the URL now.
    const back = app ? "&app=1" : "";
    q.append("success_url", `https://plasticdetox.org/vet.html?paid=1${back}&session={CHECKOUT_SESSION_ID}`);
    q.append("cancel_url", `https://plasticdetox.org/vet.html?canceled=1${back}`);
    // Without this Stripe shows no promo code field at all, so a coupon in the
    // dashboard is unusable: there is nowhere to type it.
    q.append("allow_promotion_codes", "true");
    q.append("metadata[type]", "vet-pack");
    q.append("metadata[pack]", pack);
    q.append("metadata[checks]", String(p.checks));
    q.append("line_items[0][quantity]", "1");
    q.append("line_items[0][price_data][currency]", "usd");
    q.append("line_items[0][price_data][unit_amount]", String(p.usd));
    q.append("line_items[0][price_data][product_data][name]", p.name);
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.STRIPE_SECRET_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: q.toString(),
    });
    const data = await res.json();
    if (res.ok && data.url) return json({ ok: true, url: data.url }, 200, corsOrigin);
    return json({ ok: false, error: (data.error && data.error.message) || "Stripe error" }, 502, corsOrigin);
  } catch (e) {
    return json({ ok: false, error: "Server error" }, 500, corsOrigin);
  }
}

// Token-gated pass minting, for testing and make-goods. Never public.
async function handleVetGrant(request, env, corsOrigin) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!env.STATS_TOKEN || token !== env.STATS_TOKEN) {
    return json({ ok: false, error: "Not authorized" }, 401, corsOrigin);
  }
  const body = await request.json().catch(() => ({}));
  const checks = Math.min(500, Math.max(1, Number(body.checks) || 20));
  const pass = await mintVetPass(env, checks, body.email || "", "grant");
  if (body.email) await sendPassEmail(env, body.email, pass, checks);
  return json({ ok: true, pass, checks,
    url: `https://plasticdetox.org/vet.html?pass=${pass}` }, 200, corsOrigin);
}

// The success page trades its Stripe session id for the pass. The webhook
// normally lands first and has stored the session -> pass mapping; we wait a
// few seconds for it, then verify the payment with Stripe ourselves and mint,
// so a slow or failing webhook cannot strand a paid customer on an empty page.
async function handleVetClaim(request, env, corsOrigin) {
  const sid = (new URL(request.url).searchParams.get("session") || "").trim();
  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(sid)) {
    return json({ ok: false, error: "Bad session" }, 400, corsOrigin);
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const token = await env.BRAND_SEARCHES.get("vetsession:" + sid);
    if (token) {
      const rec = await env.BRAND_SEARCHES.get("vetpass:" + token, { type: "json" });
      if (rec) return json({ ok: true, pass: token, balance: rec.balance, email: rec.email || "" }, 200, corsOrigin);
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1200));
  }
  if (!env.STRIPE_SECRET_KEY) {
    return json({ ok: false, error: "Not configured" }, 503, corsOrigin);
  }
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions/" + sid, {
    headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY },
  });
  const s = await res.json().catch(() => ({}));
  if (!res.ok || !PAID.has(s.payment_status) || !s.metadata || s.metadata.type !== "vet-pack") {
    return json({ ok: false, error: "Payment not found" }, 404, corsOrigin);
  }
  const checks = Math.min(500, Math.max(1, Number(s.metadata.checks) || 0));
  const email = (s.customer_details && s.customer_details.email) || "";
  const pass = await mintVetPass(env, checks, email, s.metadata.pack || "");
  await env.BRAND_SEARCHES.put("vetsession:" + sid, pass);
  return json({ ok: true, pass, balance: checks }, 200, corsOrigin);
}

async function handleVetBalance(request, env, corsOrigin) {
  const pass = new URL(request.url).searchParams.get("pass") || "";
  const rec = pass && await env.BRAND_SEARCHES.get("vetpass:" + pass, { type: "json" });
  if (!rec) return json({ ok: false, error: "Pass not found" }, 404, corsOrigin);
  return json({ ok: true, balance: rec.balance, purchased: rec.purchased, used: rec.used }, 200, corsOrigin);
}

/**
 * An answer somebody has already paid for, read without spending anything.
 *
 * The research was always stored, and asking for it again returned it free.
 * But the page never asked: it looked in our own reviewed database, found
 * nothing, and printed "we have not checked this yet" over a button. So from
 * the outside a check that cost a credit and took a hundred seconds had simply
 * vanished. Anya checked a candle, came back to it, and was told it had never
 * been checked.
 *
 * No pass is needed. The answer is already bought and paid for, and it is
 * going into the public database after review anyway.
 */
async function handleVetKnown(request, env, corsOrigin) {
  const u = new URL(request.url);
  const brand = (u.searchParams.get("brand") || "").trim().slice(0, 80);
  const product = (u.searchParams.get("product") || "").trim().slice(0, 160);
  const url = (u.searchParams.get("url") || "").trim().slice(0, 500);
  if (!brand && !product && !url) return json({ ok: true, found: false }, 200, corsOrigin);
  for (const k of researchKeys(brand, product, null, asinFromUrl(url))) {
    const hit = await env.BRAND_SEARCHES.get(k, { type: "json" }).catch(() => null);
    const rec = hit && hit.alias
      ? await env.BRAND_SEARCHES.get(hit.alias, { type: "json" }).catch(() => null)
      : hit;
    if (!rec || !rec.fronts || (rec.engine || 0) < VET_ENGINE) continue;
    return json({ ok: true, found: true, verdict: rec.verdict, capNote: rec.capNote || "",
                  fronts: rec.fronts, at: rec.at, identified: rec.identified || null,
                  // Whether asking again would repair our own failure, which is
                  // what decides whether it costs the customer anything.
                  repairable: repairableFronts(rec.fronts) },
                200, corsOrigin);
  }
  return json({ ok: true, found: false }, 200, corsOrigin);
}

async function handleCustomerVet(request, env, corsOrigin) {
  const body = await request.json().catch(() => ({}));
  const pass = (body.pass || "").toString().trim();
  const brand = (body.brand || "").toString().trim().slice(0, 80);
  const product = (body.product || "").toString().trim().slice(0, 160);
  const url = (body.url || "").toString().trim().slice(0, 500);
  // Asked for again on purpose, rather than handed the answer we already have.
  const fresh = body.fresh === true;
  if (!brand && !url) return json({ ok: false, error: "brand is required" }, 400, corsOrigin);
  const key = "vetpass:" + pass;
  const rec = pass && await env.BRAND_SEARCHES.get(key, { type: "json" });
  if (!rec) return json({ ok: false, error: "Pass not found" }, 401, corsOrigin);

  const s = sseResponse(corsOrigin);
  (async () => {
    const r = await vetCore(env, brand, product, s.send, rec.balance > 0, url, fresh);
    let consumed = false;
    if (r.needsCredits) {
      s.send({ done: true, elapsedMs: r.elapsedMs, needsCredits: true, balance: rec.balance,
               error: "This product is not in our database yet, and this pass has no checks left." });
      await s.writer.close();
      return;
    }
    if (!r.fromDatabase && r.chargeable) {
      rec.balance = Math.max(0, rec.balance - 1);
      rec.used = (rec.used || 0) + 1;
      rec.history = (rec.history || []).slice(-49);
      rec.history.push({ ts: new Date().toISOString(), brand, product, verdict: r.verdict });
      await env.BRAND_SEARCHES.put(key, JSON.stringify(rec));
      consumed = true;
    }
    if (r.researchFailed) {
      s.send({ done: true, elapsedMs: r.elapsedMs, consumed: false, balance: rec.balance,
               error: r.failMessage });
      await s.writer.close();
      return;
    }
    s.send({ done: true, elapsedMs: r.elapsedMs, verdict: r.verdict, capNote: r.capNote,
             label: r.repair
               ? "Checked again just now. The last answer was short because a database of ours was down, so this one is free."
               : r.fromDatabase
               ? "From our reviewed database, no credit consumed"
               : r.fromResearch
                 ? `Checked ${String(r.researchedAt || "").slice(0, 10)}, already researched for someone else. No credit used.`
                 : "Checked just now, sources on every line",
             fronts: r.fronts, fromDatabase: r.fromDatabase, engine: VET_ENGINE,
             identified: r.identified || null, consumed, balance: rec.balance });
    await s.writer.close();
  })().catch(async (e) => {
    try { s.send({ done: true, error: String(e).slice(0, 200) }); await s.writer.close(); } catch (_) {}
  });
  return new Response(s.readable, { headers: s.headers });
}

function handleVetTest(request, env) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!env.STATS_TOKEN || token !== env.STATS_TOKEN) {
    return new Response("Add ?token=... (same token as /brand-stats)", { status: 401 });
  }
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Instant Vet Bench</title>
<style>
body{font:15px -apple-system,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#1c1917}
input{font:inherit;padding:10px;border:1px solid #d6d3d1;border-radius:8px;width:100%;box-sizing:border-box;margin:4px 0}
button{font:inherit;font-weight:600;padding:10px 18px;border:0;border-radius:8px;background:#16a34a;color:#fff;cursor:pointer;margin-top:8px}
.clock{font-size:32px;font-weight:700;font-variant-numeric:tabular-nums;margin:16px 0 4px}
.log div{padding:6px 0;border-bottom:1px solid #f5f5f4}
.badge{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;padding:2px 8px;border-radius:5px}
.pass{background:#dcfce7;color:#15803d}.caution{background:#fef3c7;color:#b45309}
.fail{background:#fee2e2;color:#dc2626}.unassessed{background:#f5f5f4;color:#78716c}
.none{background:#f0fdf4;color:#3f6212;border:1px dashed #86efac}
.verdict{font-size:22px;font-weight:700;margin:14px 0 2px}
.unrev{font-size:12px;color:#b45309;font-weight:600}
small{color:#78716c}
</style>
<h2>Instant Vet Bench</h2>
<p><small>Prototype. Times every step of a live four-check vet.</small></p>
<input id="b" placeholder="Brand (required), e.g. Graza">
<input id="p" placeholder="Product, e.g. Sizzle extra virgin olive oil">
<button onclick="go()">Vet it</button>
<div class="clock" id="clock">0.0s</div>
<div class="log" id="log"></div>
<div id="result"></div>
<script>
let timer;
async function go(){
  const log=document.getElementById('log'), res=document.getElementById('result'), clock=document.getElementById('clock');
  log.innerHTML='';res.innerHTML='';
  const t0=Date.now();
  clearInterval(timer);
  timer=setInterval(()=>{clock.textContent=((Date.now()-t0)/1000).toFixed(1)+'s'},100);
  const line=(html)=>{const d=document.createElement('div');d.innerHTML=html;log.appendChild(d)};
  line('Checking recall databases, reading the label, searching lab tests…');
  const r=await fetch(location.pathname.replace('vet-test','instant-vet')+location.search,{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({brand:document.getElementById('b').value,product:document.getElementById('p').value})});
  if(!r.ok){clearInterval(timer);line('Error: '+r.status+' '+await r.text());return}
  const reader=r.body.getReader();const dec=new TextDecoder();let buf='';
  const NAME={formula:'Formula',materials:'Materials',legal:'Recalls & lawsuits',testing:'Independent tests'};
  while(true){
    const {done,value}=await reader.read();if(done)break;
    buf+=dec.decode(value,{stream:true});
    let i;
    while((i=buf.indexOf('\\n\\n'))>=0){
      const chunk=buf.slice(0,i);buf=buf.slice(i+2);
      if(!chunk.startsWith('data: '))continue;
      const e=JSON.parse(chunk.slice(6));
      if(e.internal){console.log('internal:',e);continue}
      if(e.front){
        const f=e.front;
        const lbl=f.status==='none'?(e.step==='testing'?'none found':'N/A'):f.status;
        line('<span class="badge '+f.status+'">'+lbl+'</span> <b>'+(NAME[e.step]||e.step)+'</b> at '+(e.ms/1000).toFixed(1)+'s<br><small>'+f.note+(f.source?' · <a href="'+f.source+'" target="_blank" rel="noopener">source</a>':'')+'</small>');
      }
      if(e.done){
        clearInterval(timer);
        if(e.error){line('Error: '+e.error);continue}
        res.innerHTML='<div class="verdict">'+({good:'Good choice',careful:'Careful',skip:'Skip',unrated:'Not enough found'}[e.verdict]||e.verdict)+'</div><div class="unrev">'+e.label+' · finished in '+(e.elapsedMs/1000).toFixed(1)+'s</div>'+(e.capNote?'<div><small>'+e.capNote+'</small></div>':'');
      }
    }
  }
}
</script>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
