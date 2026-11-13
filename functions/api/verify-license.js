// functions/api/verify-license.js
// Verifies a Gumroad license key server-side. Each template ("modern",
// "classic", ...) is its OWN Gumroad product with its OWN Product ID.
// A key only verifies successfully against the product it was bought for --
// Gumroad enforces this itself, so no extra locking logic is needed here.
//
// Requires one secret per template, e.g.:
//   wrangler pages secret put GUMROAD_PRODUCT_ID_MODERN
//   wrangler pages secret put GUMROAD_PRODUCT_ID_CLASSIC
// (paste each product's ID from its own Content -> License Key module)

// Map your templateKey() values to the matching env var holding that
// template's Gumroad Product ID. templateKey() returns "<category>/<style>",
// e.g. "resume/style1" -- NOT plain names like "modern" or "classic".
// Add a new line here every time you gate a new style with its own product.
const PRODUCT_ID_ENV_BY_TEMPLATE = {
  "resume/style1": "GUMROAD_PRODUCT_ID_TIMELESS",
  "resume/style2": "GUMROAD_PRODUCT_ID_SLEEK",
  "resume/style3": "GUMROAD_PRODUCT_ID_EXECUTIVE",
  "resume/style4": "GUMROAD_PRODUCT_ID_VIVID",
  "resume/style5": "GUMROAD_PRODUCT_ID_PURE",
  "resume/style6": "GUMROAD_PRODUCT_ID_REFINED",
  "resume/style7": "GUMROAD_PRODUCT_ID_DYNAMIC",
  "resume/style8": "GUMROAD_PRODUCT_ID_SKILLFOCUS",
  "resume/style9": "GUMROAD_PRODUCT_ID_CORPORATE",
  "resume/style10": "GUMROAD_PRODUCT_ID_TRENDY",
  "resume/style11": "GUMROAD_PRODUCT_ID_HORIZON",
  "resume/style12": "GUMROAD_PRODUCT_ID_MIDNIGHT",
  "resume/style13": "GUMROAD_PRODUCT_ID_EMBER",
  "resume/style14": "GUMROAD_PRODUCT_ID_CANVAS",
  "resume/style15": "GUMROAD_PRODUCT_ID_GRAPHITE",
  "resume/style16": "GUMROAD_PRODUCT_ID_IVORY",
  "resume/style17": "GUMROAD_PRODUCT_ID_STORM",
  "resume/style18": "GUMROAD_PRODUCT_ID_LINEN",
  "resume/style19": "GUMROAD_PRODUCT_ID_PRISM",
  "resume/style20": "GUMROAD_PRODUCT_ID_OBSIDIAN",
};

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
  if (!licenseKey || typeof licenseKey !== "string" || !licenseKey.trim()) {
    return new Response(JSON.stringify({ valid: false, reason: "Missing license key" }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
  if (!templateKey || typeof templateKey !== "string") {
    return new Response(JSON.stringify({ valid: false, reason: "Missing template identifier" }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  const normalizedTemplate = templateKey.trim().toLowerCase();
  const envVarName = PRODUCT_ID_ENV_BY_TEMPLATE[normalizedTemplate];
  if (!envVarName) {
    return new Response(JSON.stringify({ valid: false, reason: `Unknown template "${templateKey}".` }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  const productId = env[envVarName];
  if (!productId) {
    return new Response(JSON.stringify({ error: `Server is missing ${envVarName}.` }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  const trimmedKey = licenseKey.trim();

  const params = new URLSearchParams();
  params.append("product_id", productId);
  params.append("license_key", trimmedKey);
  params.append("increment_uses_count", "false"); // Gumroad's own per-product access is enough; no cap for now

  try {
    const gumroadRes = await fetch("https://api.gumroad.com/v2/licenses/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    const data = await gumroadRes.json();

    if (!data.success) {
      // This is the key case that replaces the old KV lock: if this key was
      // bought for a DIFFERENT template, it belongs to a different Gumroad
      // product, so verifying it against THIS template's product ID fails
      // right here -- no extra bookkeeping required.
      return new Response(JSON.stringify({ valid: false, reason: data.message || "This license key is not valid for this template." }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    return new Response(JSON.stringify({ valid: true, email: data.purchase?.email || null }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Verification failed" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
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
