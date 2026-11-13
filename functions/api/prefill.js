// functions/api/prefill.js
// Prefills the MASTER resume form (one fixed schema, regardless of which
// template the user eventually picks) from messy pasted/uploaded text.
// This is simpler and more reliable than the old per-template approach,
// since the AI only ever targets one known shape.

const MASTER_SCHEMA_EXAMPLE = {
  fullName: "Jane Doe",
  jobTitle: "Senior Product Designer",
  summary: "2-3 sentence professional summary in polished resume language.",
  contact: { email: "", phone: "", location: "", website: "" },
  socialLinks: [{ platform: "LinkedIn", url: "" }],
  skills: [{ name: "", level: 0 }],
  languages: [{ name: "", level: 0 }],
  experience: [{ jobTitle: "", company: "", location: "", startDate: "", endDate: "", bullets: [""] }],
  education: [{ degree: "", institution: "", startDate: "", endDate: "", description: "" }],
  projects: [{ name: "", description: "", liveUrl: "", codeUrl: "" }],
  references: [{ name: "", title: "", company: "", phone: "", email: "" }]
};

const SYSTEM_PROMPT = `You convert messy, unstructured resume information into a strict JSON object matching this exact schema:

${JSON.stringify(MASTER_SCHEMA_EXAMPLE, null, 2)}

Rules:
- Use the EXACT same keys and nesting shown above. Never add or remove top-level keys.
- If information is missing, use an empty string "" or empty array [] — never invent facts, numbers, dates, or achievements.
- "level" fields (0-100) are optional confidence/proficiency ratings — if the person didn't indicate skill level, use 0 (the frontend treats 0 as "unrated" and won't display a bar).
- Rewrite "summary" and each experience's "bullets" in clean, professional resume language based only on what the person actually said.
- Fix spelling and grammar mistakes in all descriptive text you fill (summary, bullets, education/project descriptions, etc.). Preserve the original meaning, and never change names, company names, job titles, degrees, institutions, dates, or numbers while doing so.
- Do NOT include "profileImage" — that is handled separately via file upload, never by you.
- Order experience and education most-recent first if determinable.
- Respond with ONLY the JSON object. No markdown fences, no preamble.`;

const MODEL_CHAIN = [
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite"
];
const ALLOWED_MODELS = new Set(MODEL_CHAIN);
const DEFAULT_MODEL = MODEL_CHAIN[0];

// Quota, overload, or unknown-model errors move on to the next model.
const RETRYABLE = new Set([404, 429, 500, 502, 503, 504]);

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (!env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "Server is missing GEMINI_API_KEY." }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  const { rawText, model } = body;
  if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
    return new Response(JSON.stringify({ error: "Missing 'rawText'" }), {
      status: 400, headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  const firstModel = ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL;
  const tryOrder = [firstModel, ...MODEL_CHAIN.filter(m => m !== firstModel)];
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: rawText }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.4 }
  });

  let result = null;
  let usedModel = null;
  let lastError = "";
  let lastStatus = 503;

  for (const m of tryOrder) {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${env.GEMINI_API_KEY}`;
    try {
      const geminiResponse = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody
      });
      const json = await geminiResponse.json();
      if (geminiResponse.ok) { result = json; usedModel = m; break; }
      lastError = json.error?.message || "Gemini API error";
      lastStatus = geminiResponse.status;
      // Bad key or bad request: every other model will fail the same way, so stop.
      if (!RETRYABLE.has(geminiResponse.status)) break;
    } catch (err) {
      lastError = err.message || "Unexpected server error";
    }
  }

  if (!result) {
    const busy = RETRYABLE.has(lastStatus);
    return new Response(JSON.stringify({
      error: busy ? "Our AI is very busy right now. Please try again in a few hours." : lastError,
      busy,
      details: lastError
    }), {
      status: busy ? 503 : lastStatus, headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  try {
    const candidate = result.candidates && result.candidates[0];
    const text = candidate?.content?.parts?.map(p => p.text || "").join("") || "";
    const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

    let data;
    try {
      data = JSON.parse(cleaned);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Model did not return valid JSON", raw: cleaned }), {
        status: 502, headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    return new Response(JSON.stringify({ data, model: usedModel }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Unexpected server error" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
}
