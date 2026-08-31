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

    // ===== iOS app: which web bundle should this install be running? =====
    if (path === "/app-update") {
      return handleAppUpdate(request, env, corsOrigin);
    }

    // ===== Private stats view: every brand searched, ranked by count (GET) =====
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

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // ===== Instant vet prototype: live four-front research on one product =====
    if (path === "/instant-vet") {
      return handleInstantVet(request, env, corsOrigin);
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
  const none = (why) => json({ message: why, version: "builtin" }, 200, corsOrigin);
  try {
    let running = "";
    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      running = String(body.version_name || body.version || "");
      // A fresh install reports "builtin": it is running the bundle compiled
      // into the binary, which has no version of its own. The native app
      // version is the right thing to compare against, and it is why a
      // release bumps MARKETING_VERSION to match the bundle version. Without
      // this, every new install downloads a copy of what it already has.
      if (!running || running === "builtin") {
        running = String(body.version_build || body.version_native || "");
      }
    }

    const res = await fetch("https://plasticdetox.org/app/updates.json", {
      cf: { cacheTtl: 60, cacheEverything: true },
    });
    if (!res.ok) return none("no manifest");

    const manifest = await res.json();
    const latest = manifest && manifest.latest;
    const bundle = latest && manifest.bundles && manifest.bundles[latest];
    if (!bundle || !bundle.url || !bundle.checksum) return none("no bundle");
    if (running && !newer(latest, running)) return none("up to date");

    return json({
      version: bundle.version,
      url: bundle.url,
      checksum: bundle.checksum,
    }, 200, corsOrigin);
  } catch (e) {
    return none("check failed");
  }
}

/** Semver compare, enough for the three number versions we publish. */
function newer(candidate, current) {
  const parse = (v) => String(v).split(".").map((n) => parseInt(n, 10) || 0);
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
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
          listIds: env.BREVO_LIST_ID ? [parseInt(env.BREVO_LIST_ID)] : [],
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

    const amount = s.amount_total || 0; // cents

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
// openFDA query and usually lands inside two seconds; formula/packaging and
// testing each run as one Claude call with server-side web search.
//
// This is a prototype for feeling the latency, so the model classifies fronts
// directly from a compact digest of the rating rules. The production path is
// the one the repo documents: the model records facts, the Python rules engine
// computes the verdict, and everything ships through the validated pipeline.
// Either way the card is labelled "Research, not yet reviewed": an unreviewed
// machine verdict never wears the badge.
// ============================================================================

const VET_MODEL = "claude-haiku-4-5";
const VET_TIMEOUT_MS = 70000;

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
  return f === b || f.startsWith(b + " ");
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
  const ms = Date.now() - t0;
  if (total === 0) {
    return { status: "pass", ms,
      note: examined === 0
        ? "Checked the FDA enforcement database just now. No recall on record, and no firm with a similar name either."
        : "Checked the FDA enforcement database just now. Matches by name belong to differently named firms; nothing on record for this brand.",
      source: "https://open.fda.gov/apis/" };
  }
  const y = latest.date ? latest.date.slice(0, 4) : "unknown year";
  const old = latest.date && Number(latest.date.slice(0, 4)) <= new Date().getFullYear() - 3;
  return {
    status: old && /terminated|completed/i.test(latest.status) ? "pass" : "caution", ms,
    note: `FDA enforcement records list ${total} recall(s) for this firm, latest ${y} (${latest.status}): ${latest.reason}` +
      (old ? " Over 24 months and closed, so informational under our rules." : " Recent enough to count."),
    source: "https://open.fda.gov/apis/",
  };
}

// One Claude call with server-side web search. Returns parsed JSON or null.
async function vetClaude(env, system, userText, maxUses) {
  if (!env.ANTHROPIC_API_KEY) return { unconfigured: true };
  let messages = [{ role: "user", content: userText }];
  for (let turn = 0; turn < 3; turn++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: VET_MODEL,
        max_tokens: 1200,
        system,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxUses }],
        messages,
      }),
      signal: AbortSignal.timeout(VET_TIMEOUT_MS - 5000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { error: `API ${res.status}: ${body.slice(0, 160)}` };
    }
    const msg = await res.json();
    if (msg.stop_reason === "pause_turn") {
      // A long search turn paused; hand the partial turn back and continue.
      messages = messages.concat([{ role: "assistant", content: msg.content }]);
      continue;
    }
    const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { error: "no JSON in reply" };
    // Web search wraps quoted findings in <cite> tags; the card wants prose.
    try { return { data: JSON.parse(m[0].replace(/<\/?cite[^>]*>/g, "")) };
    } catch (e) { return { error: "unparseable JSON" }; }
  }
  return { error: "search did not finish in three turns" };
}

const VET_RULES = `You are a researcher for Plastic Detox, a consumer safety site. Judge ONLY from what you actually find; when you cannot determine something, say "unassessed". Never guess.
Status rules (a digest of our standard):
- fail: a named hazard in the path that reaches a person: PTFE/PFAS, PVC, polycarbonate/BPA, polystyrene, melamine, phthalates, formaldehyde releasers, triclosan, lead, cadmium, chemical UV filters (oxybenzone, avobenzone, octinoxate, octisalate, octocrylene, homosalate), aluminum chlorohydrate/zirconium, talc.
- fail: plastic in the path of hot water, brewed drink, or heated food. Heat drives migration harder than anything else and this is the ingestion path. Pod and capsule coffee machines (plastic water paths, plastic pods brewed under near-boiling pressurized water), plastic kettles and plastic-path hot appliances fail here; so does anything plastic immersed in what a person drinks (the tea bag rule). Anhydrous oil stored in PET also fails. "BPA-free" does not rescue this: any plastic in a hot drink path fails, resin stated or not.
- caution: a disclosure umbrella ("fragrance", "parfum", "proprietary blend", "natural flavors"); or an emulsion in plastic packaging; or plastic with resin unstated holding anything not dry; or cold-water contact with unstated plastic.
- pass: inert materials (glass, stainless, aluminum container, paper, cotton, wood); dry contents in any plastic; a full ingredient list with none of the above.
- none: you checked, and nothing of this kind exists or applies. A durable good has no contents, so its "packaging" is none (the contact surface is judged under formula). A product nobody has lab tested is testing none. This is a completed check, not a gap.
- unassessed: ONLY when you could not complete the check.
For a durable good or appliance, "formula" means the surfaces that actually touch the water, food, drink, or skin (the reservoir, tubing, brew chamber, cooking surface, drink path), never the retail box. Well documented facts about a product category (how a pod machine brews, what a nonstick coating is) are evidence you may use; name the category fact in the note.
Respond with ONLY a JSON object, no prose.`;

async function vetLabel(env, brand, product) {
  const r = await vetClaude(env, VET_RULES,
    `Product: ${brand} ${product}. Find (1) "formula": what the product itself is made of. For a consumable that is the ingredient list; for an appliance or durable good it is the materials of the surfaces that touch the water, food, drink, or skin (reservoir, tubing, brew chamber, cooking surface). How the product is BUILT always belongs here, never under testing, and plastic in a hot water or drink path is a formula fail. (2) "packaging": the container that holds the contents (matters for cosmetics, food, liquids). A durable good or appliance has no contents, so its packaging is status "none" with note "Not applicable: no contents; the contact surfaces are judged under formula." Reply ONLY: {"formula":{"status":"pass|caution|fail|none|unassessed","note":"<one sentence of facts>","source":"<url>"},"packaging":{"status":"...","note":"...","source":"..."}}`,
    3);
  return r;
}

async function vetTesting(env, brand, product) {
  const r = await vetClaude(env, VET_RULES,
    `Product: ${brand} ${product}. This front is ONLY for actual measurements and certifications: lab results, peer reviewed studies, certifications (Lead Safe Mama, Mamavation, Consumer Reports, NSF, OEKO-TEX, GOTS, EWG Verified), including studies that MEASURED this product category (for example microplastic particle counts from pod coffee machines or tea bags), which count at caution strength with the note saying it is a category measurement. What the product is made of or how it is built is NOT testing evidence and must not be reported here. A clean result needs its detection limit to count as pass. If you searched and no measurement has been published, status is "none" with note "We searched; no independent testing of this product has been published." Use "unassessed" only if you could not complete the search. Reply ONLY: {"testing":{"status":"pass|caution|fail|none|unassessed","note":"<one sentence>","source":"<url or empty>"}}`,
    2);
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
          if (k.length >= 3 && !map.has(k)) map.set(k, b);
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
  const all = ["formula", "packaging", "legal", "testing"].map(st);
  if (all.includes("fail")) return "skip";
  if (all.includes("caution")) return "careful";
  // "none" satisfies a check the way the pipeline's gate treats it: we
  // looked, and nothing of this kind applies. Only "unassessed" blocks.
  const blocking = ["formula", "packaging", "legal"];
  if (blocking.every((k) => st(k) === "pass" || st(k) === "none")) return "good";
  return "unrated";
}

async function handleInstantVet(request, env, corsOrigin) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!env.STATS_TOKEN || token !== env.STATS_TOKEN) {
    return json({ ok: false, error: "Not authorized" }, 401, corsOrigin);
  }
  const body = await request.json().catch(() => ({}));
  const brand = (body.brand || "").toString().trim().slice(0, 80);
  const product = (body.product || "").toString().trim().slice(0, 160);
  if (!brand) return json({ ok: false, error: "brand is required" }, 400, corsOrigin);

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const send = (obj) => writer.write(enc.encode("data: " + JSON.stringify(obj) + "\n\n"));
  const t0 = Date.now();

  const run = async () => {
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
        send({ done: true, elapsedMs: Date.now() - t0, verdict,
               label: "From our reviewed database, no credit consumed", fronts: {},
               fromDatabase: true });
        await writer.close();
        return;
      }
      brandStance = b.stance;
      // Internal context: it steers the verdict cap below, and the review
      // queue will want it, but the customer card never shows it. Anna's
      // call: the shopper gets the four checks, not our reasoning trail.
      send({ step: "database", internal: true,
        front: { status: STANCE_BADGE[b.stance] || "unassessed",
        note: `Brand context (internal): we rate ${b.brand} ${b.stance}. `
          + `Researching this exact product now.`,
        source: `https://plasticdetox.org/brand-check.html?b=${encodeURIComponent(b.brand)}` },
        ms: Date.now() - t0 });
    }

    const finish = (key, r, aiKeys) => {
      // Claude legs return {data} | {error} | {unconfigured}; legal returns a front.
      for (const k of aiKeys) {
        if (r.data && r.data[k] && r.data[k].status) {
          fronts[k] = r.data[k];
        } else {
          fronts[k] = { status: "unassessed",
            note: r.unconfigured
              ? "AI research is not configured on this worker yet (missing ANTHROPIC_API_KEY)."
              : `Could not complete this check (${r.error || "no result"}).`,
            source: "" };
        }
        send({ step: k, front: fronts[k], ms: Date.now() - t0 });
      }
    };

    const legalP = vetLegal(brand).then((f) => { fronts.legal = f; send({ step: "legal", front: f, ms: Date.now() - t0 }); });
    const labelP = vetLabel(env, brand, product).then((r) => finish("label", r, ["formula", "packaging"]));
    const testP = vetTesting(env, brand, product).then((r) => finish("testing", r, ["testing"]));
    await Promise.allSettled([legalP, labelP, testP]);

    for (const k of ["formula", "packaging", "legal", "testing"]) {
      if (!fronts[k]) fronts[k] = { status: "unassessed", note: "Did not finish in time.", source: "" };
    }
    let verdict = vetVerdict(fronts);
    // Rule 1.1: adverse brand evidence propagates as a caution with its scope
    // named (the database line above names it); favourable never does. A clean
    // read on one product cannot out-rank what we hold against its maker.
    let capNote = "";
    if ((brandStance === "careful" || brandStance === "skip") && verdict === "good") {
      verdict = "careful";
      capNote = `This product read clean, and we still rate the brand itself ${brandStance}.`;
    }
    send({ done: true, elapsedMs: Date.now() - t0, verdict, capNote,
           label: "Research, not yet reviewed", fronts });
    await writer.close();
  };
  run().catch(async (e) => {
    try { await send({ done: true, error: String(e).slice(0, 200) }); await writer.close(); } catch (_) {}
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": corsOrigin,
    },
  });
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
  const NAME={formula:'Formula',packaging:'Packaging',legal:'Recalls & lawsuits',testing:'Independent tests'};
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
