/*
  mapping-engine.js
  ------------------
  Deterministically transforms master-schema form data into a specific
  template's real data.json shape, using that template's mapping config.
  No AI involved in this step — it's pure, instant, and can never hallucinate,
  since it only ever moves/renames values that already exist.
*/

function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * @param {object} masterData - form data following the master schema
 * @param {object} originalTemplateData - the template's own default data.json
 *        (used as the base, so untouched fields like theme colors, footer
 *        boilerplate, etc. are preserved exactly as the template author wrote them)
 * @param {object} mapping - one entry from resume-mappings.json for this template
 * @returns {object} a new object in the template's exact schema shape
 */
function applyMapping(masterData, originalTemplateData, mapping) {
  const result = deepClone(originalTemplateData);

  // 1. Split-name handling (e.g. style11's personalInfo.firstName/lastName)
  if (mapping.splitName) {
    const full = (getPath(masterData, mapping.splitName.sourcePath) || '').trim();
    const parts = full.split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';
    setPath(result, mapping.splitName.firstNameTarget, firstName);
    setPath(result, mapping.splitName.lastNameTarget, lastName);
  }

  // 2. Scalar field mapping. Normally targetPath is a plain string. It can
  // also be an object { path, wrapInArray: true } for templates that expect
  // a single-paragraph field as a one-element array of paragraphs instead
  // of a plain string.
  if (mapping.scalar) {
    for (const [masterPath, targetSpec] of Object.entries(mapping.scalar)) {
      if (masterPath.startsWith('_')) continue; // skip note/comment keys
      const value = getPath(masterData, masterPath);
      const targetPath = (typeof targetSpec === 'object' && targetSpec.path) ? targetSpec.path : targetSpec;
      const wrap = typeof targetSpec === 'object' && !!targetSpec.wrapInArray;
      const isBlank = value === undefined || value === null || value === '';
      if (isBlank) {
        // Blank field: clear the template's sample value so it never shows on the resume.
        if (targetPath === 'profile.image') continue; // photo handled separately
        // keepWhenBlank: the design ships with its own artwork there (e.g. a
        // hero photo) — leave it in place until the user replaces it.
        if (typeof targetSpec === 'object' && targetSpec.keepWhenBlank) continue;
        setPath(result, targetPath, wrap ? [] : '');
        continue;
      }
      setPath(result, targetPath, wrap ? [value] : value);
    }
  }

  // 3. Array field mapping
  if (mapping.arrays) {
    for (const [masterArrayPath, arrCfg] of Object.entries(mapping.arrays)) {
      const sourceArr = getPath(masterData, masterArrayPath);
      if (!Array.isArray(sourceArr) || sourceArr.length === 0) {
        // Empty section: clear the template's sample items so nothing shows on the resume.
        if (arrCfg.targetPath) setPath(result, arrCfg.targetPath, []);
        continue;
      }

      let newArr;
      if (arrCfg.scalarFromItem) {
        // e.g. master skills=[{name,level}] -> target skills=["JavaScript", "React"]
        newArr = sourceArr.map(item => item[arrCfg.scalarFromItem]).filter(Boolean);
      } else if (arrCfg.itemMap) {
        // Designs that keep their social links in the footer know how to draw
        // each platform (their own icon class or image name). Collect those
        // from the template's own data so a user-entered link keeps the
        // design's icon instead of rendering blank.
        let iconLookup = null;
        if (arrCfg.inheritIconFrom) {
          iconLookup = {};
          const donor = getPath(result, arrCfg.inheritIconFrom);
          if (Array.isArray(donor)) {
            donor.forEach(entry => {
              if (!entry || typeof entry !== 'object') return;
              const key = String(entry.name || entry.platform || '').trim().toLowerCase();
              if (key && entry.icon) iconLookup[key] = entry.icon;
            });
          }
        }
        newArr = sourceArr.map(item => {
          const obj = {};
          for (const [masterField, targetField] of Object.entries(arrCfg.itemMap)) {
            if (masterField.startsWith('_') || masterField === 'joinBulletsAs') continue;
            let value = item[masterField];
            if (masterField === 'bullets' && Array.isArray(value) && arrCfg.itemMap.joinBulletsAs === 'paragraph') {
              value = value.join(' ');
            }
            if (value !== undefined) obj[targetField] = value;
          }
          if (iconLookup || arrCfg.iconFallback) {
            const platform = String(obj.name || obj.platform || '').trim().toLowerCase();
            if (!obj.icon && platform && iconLookup && iconLookup[platform]) obj.icon = iconLookup[platform];
            if (!obj.icon && arrCfg.iconFallback) {
              obj.icon = arrCfg.iconFallback.replace('{slug}', platform.replace(/[^a-z0-9]+/gi, '-'));
            }
          }
          // joinFields: combine two or more master item fields into a single
          // target string (e.g. startDate + endDate -> one "period" field),
          // for templates that store a date range as one string rather than
          // separate start/end fields.
          if (arrCfg.joinFields) {
            arrCfg.joinFields.forEach(rule => {
              const parts = rule.sourceFields.map(f => item[f]).filter(Boolean);
              if (parts.length > 0) {
                obj[rule.targetField] = parts.join(rule.separator || ' ');
              }
            });
          }
          return obj;

        });
      } else {
        newArr = sourceArr;
      }
      setPath(result, arrCfg.targetPath, newArr);
    }
  }

  // 4. Object-map handling (e.g. style20's socials={LinkedIn:"...", Instagram:"..."} —
  //    an object keyed by platform name, rather than an array of {platform,url})
  if (mapping.objectMap) {
    for (const [masterArrayPath, objCfg] of Object.entries(mapping.objectMap)) {
      const sourceArr = getPath(masterData, masterArrayPath);
      if (!Array.isArray(sourceArr) || sourceArr.length === 0) {
        if (objCfg.targetPath) setPath(result, objCfg.targetPath, {});
        continue;
      }
      const obj = {};
      sourceArr.forEach(item => {
        const key = item[objCfg.keyFrom];
        const value = item[objCfg.valueFrom];
        if (key) obj[key] = value;
      });
      setPath(result, objCfg.targetPath, obj);
    }
  }

  // 5. Compose: build a single formatted string from multiple master
  // fields, for templates that display a combined value (e.g. one
  // "contact" string containing email/phone/location together, rather
  // than separate fields) instead of a structured object.
  if (mapping.compose) {
    for (const [targetPath, composeCfg] of Object.entries(mapping.compose)) {
      const rendered = composeCfg.template.replace(/\{([^}]+)\}/g, (match, token) => {
        if (token === 'year') return String(new Date().getFullYear());
        const value = getPath(masterData, token);
        return value !== undefined && value !== null ? value : '';
      });
      setPath(result, targetPath, rendered);
    }
  }

  // 6. labelValueArray: build an array of {label, value} pairs from a
  // fixed list of master field paths — for templates that display personal
  // info as a generic "definition list" rather than named fields (e.g.
  // [{label:"Email", value:"..."}] instead of a plain contact.email field).
  // Entries whose source value is missing/empty are skipped entirely.
  if (mapping.labelValueArray) {
    for (const [targetPath, cfg] of Object.entries(mapping.labelValueArray)) {
      const items = cfg.items
        .map(def => ({ label: def.label, value: getPath(masterData, def.sourcePath) }))
        .filter(entry => entry.value !== undefined && entry.value !== null && entry.value !== '');
      setPath(result, targetPath, items);
    }
  }

  // 7. contactItemsArray: build an array of {icon, text, link} objects from
  // a fixed list of master field paths — for templates that render contact
  // methods as a generic icon-linked list rather than named fields. Each
  // definition's linkTemplate supports a {value} placeholder.
  if (mapping.contactItemsArray) {
    for (const [targetPath, cfg] of Object.entries(mapping.contactItemsArray)) {
      const items = cfg.items
        .map(def => {
          const value = getPath(masterData, def.sourcePath);
          if (!value) return null;
          return {
            icon: def.icon,
            text: value,
            link: def.linkTemplate ? def.linkTemplate.replace('{value}', value) : value
          };
        })
        .filter(Boolean);
      setPath(result, targetPath, items);
    }
  }

  // 8. groupedArrays: wrap mapped array items inside a single synthetic
  // parent object — for templates that group items under a category (e.g.
  // skills displayed as [{category:"...", items:[...]}] rather than a flat
  // list). Supports multiple source arrays (e.g. master's separate "skills"
  // and "languages") each becoming their own group within the same output
  // array, since some templates fold both into one grouped structure.
  // A group may also set `groupBy` to split one source array by an item
  // field (e.g. a per-skill "category"), producing one group per distinct
  // value in first-seen order; blank values fall back to `groupValue`.
  if (mapping.groupedArrays) {
    for (const [key, cfg] of Object.entries(mapping.groupedArrays)) {
      const groupsOutput = [];
      const mapItems = (sourceArr, groupDef) => sourceArr.map(item => {
        const obj = {};
        for (const [masterField, targetField] of Object.entries(groupDef.itemMap)) {
          if (item[masterField] !== undefined) obj[targetField] = item[masterField];
        }
        return obj;
      });
      cfg.groups.forEach(groupDef => {
        const sourceArr = getPath(masterData, groupDef.sourcePath);
        if (!Array.isArray(sourceArr) || sourceArr.length === 0) return;

        if (groupDef.groupBy) {
          const buckets = new Map();
          const order = [];
          sourceArr.forEach(item => {
            const raw = item && item[groupDef.groupBy];
            const label = raw === undefined || raw === null ? '' : String(raw).trim();
            if (!buckets.has(label)) { buckets.set(label, []); order.push(label); }
            buckets.get(label).push(item);
          });
          order.forEach(label => {
            groupsOutput.push({
              [cfg.groupField]: label || groupDef.groupValue || '',
              [cfg.itemsField]: mapItems(buckets.get(label), groupDef)
            });
          });
          return;
        }

        groupsOutput.push({
          [cfg.groupField]: groupDef.groupValue,
          [cfg.itemsField]: mapItems(sourceArr, groupDef)
        });
      });
      if (groupsOutput.length > 0) {
        setPath(result, cfg.targetPath, groupsOutput);
      } else if (cfg.targetPath) {
        setPath(result, cfg.targetPath, []);
      }
    }
  }

  // 9. clear: sample paths the form never fills (e.g. a demo status tag or
  // demo stats). Each path is blanked by type: string -> "", array -> [], object -> {}.
  if (Array.isArray(mapping.clear)) {
    for (const p of mapping.clear) {
      const cur = getPath(result, p);
      if (cur === undefined) continue;
      const blank = Array.isArray(cur) ? [] : (cur !== null && typeof cur === 'object') ? {} : '';
      setPath(result, p, blank);
    }
  }

  // 10. clearIfBlank: like clear, but only when the given master field is blank.
  // Used for the sample photo: an uploaded photo always wins.
  if (mapping.clearIfBlank) {
    for (const [masterPath, paths] of Object.entries(mapping.clearIfBlank)) {
      const v = getPath(masterData, masterPath);
      const masterBlank = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
      if (!masterBlank) continue;
      for (const p of paths) {
        const cur = getPath(result, p);
        if (cur === undefined) continue;
        setPath(result, p, Array.isArray(cur) ? [] : (cur !== null && typeof cur === 'object') ? {} : '');
      }
    }
  }

  // 11. ui: the user's own colour overrides (per section and per page-frame
  // part). They are not part of any template's shape, so they travel across
  // untouched and end up in data.json.
  if (masterData && masterData.ui && typeof masterData.ui === 'object') {
    result.ui = deepClone(masterData.ui);
  }

  return result;
}

// Export for both browser (script tag) and Node/Cloudflare Functions use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applyMapping, getPath, setPath, deepClone };
}
