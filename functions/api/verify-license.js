// functions/api/verify-license.js
// Verifies a Gumroad license key server-side. The actual check lives in
// _license.js so that /api/publish enforces exactly the same rules
// (including refunds / chargebacks / disputes).
//
// Requires one secret per template on this Pages project, e.g.:
//   wrangler pages secret put GUMROAD_PRODUCT_ID_TIMELESS
// (paste each product's ID from its own Content -> License Key module)

import { verifyLicense } from "./_license.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  const { licenseKey, templateKey } = body;
  const result = await verifyLicense(env, licenseKey, templateKey);

  if (result.ok) {
    return new Response(JSON.stringify({ valid: true, email: result.email }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  if (result.status === 500) {
    return new Response(JSON.stringify({ error: result.reason }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  return new Response(JSON.stringify({ valid: false, reason: result.reason }), {
    status: 200, headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
