const ALLOWED_ORIGINS = ["https://plasticdetox.org", "https://www.plasticdetox.org"];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

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

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const path = new URL(request.url).pathname;

    // ===== Brand Check: AI read for brands not in our curated database =====
    if (path === "/brand-check") {
      return handleBrandCheck(request, env, corsOrigin);
    }

    // ===== Brand Review request: capture email + requested brand =====
    if (path === "/brand-request") {
      return handleBrandRequest(request, env, corsOrigin);
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

// Hybrid brand check: when a brand is not in our curated, human-reviewed database,
// fall back to a clearly-labeled AI estimate. The frontend always shows a disclaimer.
async function handleBrandCheck(request, env, corsOrigin) {
  try {
    const { brand } = await request.json();
    const clean = (brand || "").toString().trim().slice(0, 80);
    if (!clean) return json({ ok: false, error: "No brand" }, 400, corsOrigin);
    if (!env.ANTHROPIC_API_KEY) {
      return json({ ok: false, error: "AI lookup not configured" }, 503, corsOrigin);
    }

    const prompt =
      `You are the research assistant for Plastic Detox, a site that helps people avoid plastic, ` +
      `microplastics, and toxic chemicals in everyday products. Assess the brand "${clean}" from that lens.\n\n` +
      `Base your assessment ONLY on widely known, verifiable facts: the materials the brand is known for, ` +
      `relevant certifications, well documented recalls, lawsuits, or independent lab testing. ` +
      `Do NOT invent recalls, lawsuits, lab results, or ingredients. If you are not confident, say so and lean to "careful".\n\n` +
      `Pick exactly one verdict:\n` +
      `- "good": materials/certifications make it a solid low-tox choice\n` +
      `- "careful": fine in some cases but with real caveats, mixed evidence, or uncertainty\n` +
      `- "skip": known plastic-heavy materials, failed testing, or documented recalls/lawsuits\n\n` +
      `Respond with ONLY a JSON object, no other text: {"verdict":"good|careful|skip","summary":"one or two plain sentences, no dashes"}`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiRes.ok) return json({ ok: false, error: "AI request failed" }, 502, corsOrigin);
    const payload = await aiRes.json();
    const text = (payload.content && payload.content[0] && payload.content[0].text) || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return json({ ok: false, error: "No result" }, 502, corsOrigin);
    const parsed = JSON.parse(match[0]);
    const verdict = ["good", "careful", "skip"].includes(parsed.verdict) ? parsed.verdict : "careful";
    return json({ ok: true, verdict, summary: (parsed.summary || "").toString().slice(0, 600) }, 200, corsOrigin);
  } catch (e) {
    return json({ ok: false, error: "Server error" }, 500, corsOrigin);
  }
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
          sender: { name: env.SENDER_NAME, email: env.SENDER_EMAIL },
          to: [{ email: env.SENDER_EMAIL }],
          subject: `Brand Check request: ${cleanBrand}`,
          htmlContent: `<p><strong>${cleanBrand}</strong> was requested via Brand Check.</p><p>Requested by: ${cleanEmail}</p>`,
        }),
      }).catch(() => {});
    }

    return json({ ok: true }, 200, corsOrigin);
  } catch (e) {
    return json({ ok: false, error: "Server error" }, 500, corsOrigin);
  }
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
