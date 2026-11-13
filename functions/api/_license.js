// functions/api/_license.js
// Shared Gumroad license verification for every endpoint that grants paid
// access (verify-license, publish). Keeping one implementation means a
// refunded / charged-back / disputed purchase is rejected everywhere, not
// just on the page where the key happened to be entered first.
//
// Each template is its OWN Gumroad product with its OWN Product ID, so a key
// only verifies against the product it was bought for -- Gumroad enforces
// that itself.
//
// Requires one secret per template on the Pages project, e.g.:
//   wrangler pages secret put GUMROAD_PRODUCT_ID_TIMELESS
// (paste each product's ID from its own Content -> License Key module)

// Map templateKey() values ("resume/style1", ...) to the env var holding that
// template's Gumroad Product ID. Add a line here every time a new style gets
// its own product.
export const PRODUCT_ID_ENV_BY_TEMPLATE = {
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
  "resume/style21": "GUMROAD_PRODUCT_ID_AURORA",
  "resume/style22": "GUMROAD_PRODUCT_ID_MERIDIAN",
};

// Returns { ok: true, email } on success, otherwise
// { ok: false, status, reason }. `status` is the HTTP status the caller
// should respond with: 200 for a key that definitively isn't valid for this
// template, 500 for a server-side problem (missing secret, Gumroad
// unreachable) that the customer cannot fix by retyping their key.
export async function verifyLicense(env, licenseKey, templateKey) {
  const key = typeof licenseKey === "string" ? licenseKey.trim() : "";
  const template = typeof templateKey === "string" ? templateKey.trim().toLowerCase() : "";

  if (!key) return { ok: false, status: 200, reason: "Missing license key" };
  if (!template) return { ok: false, status: 200, reason: "Missing template identifier" };

  const envVarName = PRODUCT_ID_ENV_BY_TEMPLATE[template];
  if (!envVarName) {
    return { ok: false, status: 200, reason: `Unknown template "${templateKey}".` };
  }

  const productId = env[envVarName];
  if (!productId) {
    return { ok: false, status: 500, reason: `Server is missing ${envVarName}.` };
  }

  const params = new URLSearchParams();
  params.append("product_id", productId);
  params.append("license_key", key);
  // No use cap on purpose: publishing re-verifies on every update, and a
  // customer must be able to re-download / re-publish without burning
  // activations.
  params.append("increment_uses_count", "false");

  let data;
  try {
    const res = await fetch("https://api.gumroad.com/v2/licenses/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    data = await res.json();
  } catch (err) {
    return { ok: false, status: 500, reason: err.message || "Verification failed" };
  }

  if (!data.success) {
    // A key bought for a DIFFERENT template belongs to a different Gumroad
    // product, so it fails right here -- no extra bookkeeping required.
    return {
      ok: false,
      status: 200,
      reason: data.message || "This license key is not valid for this template.",
    };
  }

  const purchase = data.purchase || {};
  // Gumroad still reports success for purchases that were later refunded,
  // charged back, or are in dispute -- reject those explicitly.
  if (purchase.refunded) {
    return { ok: false, status: 200, reason: "This purchase was refunded, so the license is no longer valid." };
  }
  if (purchase.chargebacked) {
    return { ok: false, status: 200, reason: "This purchase was charged back, so the license is no longer valid." };
  }
  if (purchase.disputed) {
    return { ok: false, status: 200, reason: "This purchase is under dispute, so the license is on hold." };
  }

  return { ok: true, email: purchase.email || null };
}
