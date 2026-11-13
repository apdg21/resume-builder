// Cloudflare Pages Function
// Route: POST /api/generate

// Models are tried in this order. Edit the order freely.
const MODEL_CHAIN = [
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite"
];
const ALLOWED_MODELS = new Set(MODEL_CHAIN);
const DEFAULT_MODEL = MODEL_CHAIN[0];

// ---- STRONGER PROMPT (explicitly forbids image data URL and multiple objects) ----
function buildSystemPrompt(schemaJsonText) {
  return `You are filling in a website template's data file with a real person's information.

Below is the template's CURRENT data.json. Its keys, nesting, and array item shapes define the exact schema you must follow:

${schemaJsonText}

Task: using the person's raw input (provided as the user message — this may be messy text extracted from a resume/CV file, a LinkedIn export, or free-form notes), produce a NEW JSON object with:
- The EXACT SAME top-level keys as the schema above, in the same structure.
- For nested objects (e.g. "theme", "contact", "profile"), keep the same sub-keys. DO NOT flatten them.
- For arrays of objects (e.g. "experience", "education", "skills"): the output MUST be an ARRAY. Even if there is only one item, wrap it in square brackets [ ].
- Never add new keys that weren't in the schema. Never remove required top-level keys — if the person didn't give that info, use an empty string, empty array, or reasonable neutral default.
- Rewrite prose fields (like "about"/"summary" or experience descriptions) in clean, professional language based only on what the person actually said — do not invent achievements, numbers, or dates.
- **CRITICAL for the "image" field inside "profile": DO NOT change it. Keep it exactly as shown in the schema (e.g., "assets/profile.jpg"). DO NOT add any data URL, DO NOT add extra keys starting with "data:image". Leave it unchanged.**
- **CRITICAL: The response must be a SINGLE JSON object, NOT an array, and NOT multiple objects. Start with { and end with }. Do not include any text outside the JSON.**
- Respond with ONLY the JSON object.`;
}

// ---- HELPER: extract all valid JSON objects from a string ----
function extractAllJSONObjects(text) {
  let cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  const objects = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (cleaned[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const objStr = cleaned.substring(start, i + 1);
        try {
          const parsed = JSON.parse(objStr);
          objects.push(parsed);
        } catch (e) {
          // ignore invalid objects
        }
        start = -1;
      }
    }
  }
  return objects;
}

// ---- HELPER: clean invalid keys (data URLs, base64 garbage) ----
function cleanInvalidKeys(obj) {
  if (Array.isArray(obj)) {
    for (const item of obj) {
      cleanInvalidKeys(item);
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const key of Object.keys(obj)) {
      if (key.includes('data:image') || key.includes('base64') || key.includes('*/')) {
        delete obj[key];
      } else {
        cleanInvalidKeys(obj[key]);
      }
    }
  }
}

// ---- HELPER: smart merge multiple objects ----
function smartMerge(objects, schema) {
  if (objects.length === 0) return null;
  if (objects.length === 1) return objects[0];

  // Find the main object (the one with the most keys matching schema keys)
  let mainObj = null;
  let maxScore = -1;
  const schemaKeys = Object.keys(schema);

  for (const obj of objects) {
    const objKeys = Object.keys(obj);
    let score = 0;
    for (const key of objKeys) {
      if (schemaKeys.includes(key)) score++;
    }
    // Prefer objects with 'profile', 'contact', 'experience', 'education'
    if (obj.profile || obj.contact || obj.experience || obj.education) {
      score += 10;
    }
    if (score > maxScore) {
      maxScore = score;
      mainObj = obj;
    }
  }

  if (!mainObj) mainObj = objects[0];

  // Process other objects to extract skills/experience/education
  for (const obj of objects) {
    if (obj === mainObj) continue;

    // If it looks like a skill item (name + level, no company/role)
    if (obj.name && obj.level !== undefined && !obj.company && !obj.role) {
      if (!mainObj.skills) mainObj.skills = [];
      mainObj.skills.push({ name: obj.name, level: obj.level });
      continue;
    }
    // If it looks like an experience item (role + company)
    if (obj.role && obj.company) {
      if (!mainObj.experience) mainObj.experience = [];
      mainObj.experience.push(obj);
      continue;
    }
    // If it looks like an education item (degree + institution)
    if (obj.degree && obj.institution) {
      if (!mainObj.education) mainObj.education = [];
      mainObj.education.push(obj);
      continue;
    }
    // Otherwise, shallow merge any missing keys (but don't overwrite existing ones)
    for (const key of Object.keys(obj)) {
      if (!(key in mainObj)) {
        mainObj[key] = obj[key];
      } else if (Array.isArray(mainObj[key]) && Array.isArray(obj[key])) {
        mainObj[key] = mainObj[key].concat(obj[key]);
      } else if (typeof mainObj[key] === 'object' && typeof obj[key] === 'object' && 
                 !Array.isArray(mainObj[key]) && !Array.isArray(obj[key])) {
        mainObj[key] = { ...mainObj[key], ...obj[key] };
      }
    }
  }

  return mainObj;
}

// ---- MAIN REQUEST HANDLER ----
export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (!env.GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Server is missing GEMINI_API_KEY. Set it with: wrangler pages secret put GEMINI_API_KEY" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  const { schema, rawText, model } = body;

  if (!schema || typeof schema !== "object") {
    return new Response(JSON.stringify({ error: "Missing or invalid 'schema' (must be an object)" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
  if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
    return new Response(JSON.stringify({ error: "Missing 'rawText' (the user's resume/portfolio content)" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

    const firstModel = ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL;
  const tryOrder = [firstModel, ...MODEL_CHAIN.filter(m => m !== firstModel)];
  const requestBody = JSON.stringify({
    systemInstruction: {
      parts: [{ text: buildSystemPrompt(JSON.stringify(schema, null, 2)) }]
    },
    contents: [{ role: "user", parts: [{ text: rawText }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
  });

  let result = null;
  let usedModel = null;
  let lastError = "";
  // Quota, overload, or unknown-model errors move on to the next model.
  const RETRYABLE = new Set([404, 429, 500, 502, 503, 504]);

  try {
    for (const m of tryOrder) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${env.GEMINI_API_KEY}`;
      let res, json;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody
        });
        json = await res.json();
      } catch (e) {
        lastError = e.message;
        continue;
      }
      if (res.ok) { result = json; usedModel = m; break; }
      lastError = json.error?.message || `Gemini error ${res.status}`;
      // Real errors (bad API key, bad request) will fail on every model, so stop.
      if (!RETRYABLE.has(res.status)) break;
    }

    if (!result) {
      return new Response(
        JSON.stringify({
          error: "Our AI is very busy right now. Please try again in a few hours.",
          busy: true,
          details: lastError
        }),
        { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    
    const candidate = result.candidates && result.candidates[0];
    const text = candidate?.content?.parts?.map(p => p.text || "").join("") || "";

    // Extract all valid JSON objects
    const objects = extractAllJSONObjects(text);

    let filledData = null;

    if (objects.length === 0) {
      // Fallback: try direct parse
      try {
        const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
        filledData = JSON.parse(cleaned);
      } catch (e) {
        return new Response(
          JSON.stringify({ error: "Model did not return valid JSON", raw: text }),
          { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    } else {
      // Use smart merge
      filledData = smartMerge(objects, schema);
    }

    if (!filledData) {
      return new Response(
        JSON.stringify({ error: "Could not extract valid JSON from model response", raw: text }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ---- FINAL CLEANUP: remove hallucinated keys, fix image ----
    // 1. Remove any top-level keys not in the schema
    for (const key of Object.keys(filledData)) {
      if (!(key in schema)) {
        delete filledData[key];
      }
    }

    // 2. Clean profile.image: force it to the schema value, remove extra keys inside profile
    if (filledData.profile && typeof filledData.profile === 'object') {
      // Reset image to schema default (or empty string)
      filledData.profile.image = schema.profile?.image || "";
      // Delete any extra keys inside profile that aren't in schema.profile
      if (schema.profile) {
        for (const key of Object.keys(filledData.profile)) {
          if (!(key in schema.profile)) {
            delete filledData.profile[key];
          }
        }
      }
    }

    // 3. Remove any leftover keys with data:image, base64, etc. (just in case)
    cleanInvalidKeys(filledData);

    // If the result is still an array (shouldn't happen after cleanup), unwrap or merge
    if (Array.isArray(filledData)) {
      if (filledData.length === 1) {
        filledData = filledData[0];
      } else {
        filledData = smartMerge(filledData, schema);
        if (Array.isArray(filledData)) filledData = filledData[0] || {};
        cleanInvalidKeys(filledData);
      }
    }

    // Schema conformance check
    const expectedKeys = Object.keys(schema).sort().join(",");
    const gotKeys = Object.keys(filledData).sort().join(",");
    const keysMatch = expectedKeys === gotKeys;

    return new Response(
      JSON.stringify({ data: filledData, keysMatch, model: usedModel }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Unexpected server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders }
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