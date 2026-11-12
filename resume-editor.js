/*
 * resume-editor.js
 * -----------------
 * Section-based editor for the resume builder.
 *
 * Model
 * -----
 * The master schema (resume-master-schema.json) is the single source of truth.
 * The properties panel edits it, the mapping engine (mapping-engine.js) turns
 * it into the template's own shape, and the preview renders that shape.
 *
 * The template's sample data.json is never shown while editing. The mapping
 * runs against a *scrubbed* base -- the template's theme and footer
 * boilerplate are kept, every piece of sample content is blanked -- so sample
 * names and demo text can never leak into the editor or into a generated
 * resume. (The published data.json still comes from the untouched schema, so
 * the real site keeps its footer/theme boilerplate.)
 *
 * Preview
 * -------
 * The editor renders its own inline preview iframe instead of reusing the
 * modal, because it needs two things the modal does not do:
 *   1. empty sections stay visible as placeholders rather than being hidden,
 *      so the user can see (and click) what is still missing;
 *   2. clicking a section in the preview selects it in the properties panel.
 *
 * The iframe is sandboxed without allow-same-origin, so the only channel
 * between parent and frame is postMessage.
 */
(function () {
  'use strict';

  const IS_NODE = (typeof module !== 'undefined' && module.exports);
  if (!IS_NODE && typeof MASTER_SCHEMA === 'undefined') {
    console.warn('[resume-editor] master schema unavailable — editor stays off.');
    return;
  }

  // ---------------------------------------------------------------------
  // Canonical sections. Ids match the `section` value on master-schema fields.
  // ---------------------------------------------------------------------
  const SECTION_META = {
    Basics:     { icon: '👤', label: 'Basics' },
    Contact:    { icon: '📬', label: 'Contact' },
    Skills:     { icon: '🧠', label: 'Skills' },
    Languages:  { icon: '🌐', label: 'Languages' },
    Experience: { icon: '💼', label: 'Experience' },
    Education:  { icon: '🎓', label: 'Education' },
    Projects:   { icon: '🗂️', label: 'Projects' },
    References: { icon: '📌', label: 'References' }
  };
  const SECTION_ORDER = Object.keys(SECTION_META);

  // The page frame (header, hero, footer) is not a content section, but it is
  // where a theme repaints and where text can go unreadable — so it gets its
  // own panel with the same colour controls.
  const DESIGN_VIEW = 'Design';

  // Colour overrides: shared with the live preview and the published site.
  let COLORS = null;
  if (typeof RPUserColors !== 'undefined') {
    COLORS = RPUserColors;
  } else if (IS_NODE) {
    try { COLORS = require('./user-colors.js'); } catch (e) { COLORS = null; }
  }

  // ---------------------------------------------------------------------
  // Per-template DOM map: which element of the rendered template belongs to
  // which canonical section. Only needed for click-to-select; templates
  // without an explicit map fall back to matching element ids.
  //
  // Order only matters when two selectors match the same element — the first
  // one wins, so put the most specific selector first.
  // ---------------------------------------------------------------------
  const TEMPLATE_SECTIONS = {
    'resume/style11': [
      { selector: 'header.hero .hero-contacts', section: 'Contact' },
      { selector: 'header.hero',                 section: 'Basics' },
      { selector: '#aboutSection',               section: 'Basics' },
      { selector: '#skillsSection',              section: 'Skills' },
      { selector: '#educationSection',           section: 'Education' },
      { selector: '#languagesSection',           section: 'Languages' },
      { selector: '#experienceSection',          section: 'Experience' },
      { selector: '#projectsSection',            section: 'Projects' }
    ]
  };

  // Fallback id -> canonical section, used for templates with no explicit map.
  const ID_PREFIX_TO_SECTION = [
    ['about', 'Basics'], ['hero', 'Basics'], ['header', 'Basics'], ['home', 'Basics'],
    ['contact', 'Contact'], ['skill', 'Skills'], ['languag', 'Languages'],
    ['experience', 'Experience'], ['education', 'Education'],
    ['project', 'Projects'], ['reference', 'References']
  ];

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  const state = {
    canonical: {},        // master-schema data — the source of truth
    activeSection: 'Basics',
    templateKey: 'resume/style11',
    blobUrl: null,
    ready: false,
    previewToken: '',     // identifies the live preview frame
    structuralTexts: null // the template's own labels/headings
  };

  const els = {};
  let refreshTimer = null;

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  /** JSON that is safe to embed inside a <script> block. */
  function safeJson(value) {
    return JSON.stringify(value === undefined ? null : value)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  /**
   * Blank every leaf of the template's sample data, keeping only what the
   * template needs to render its own layout:
   *   - the theme (design, not content),
   *   - the footer boilerplate,
   *   - values that also appear in the template's own HTML (nav labels,
   *     section headings, and other structural text),
   *   - one blank element per array, so a template that reads `x[0].name`
   *     still finds a shape to read.
   * Everything else — the sample person's name, bio, jobs, skills — is
   * removed so it can never leak into the editor or a generated resume.
   */
  function scrubBase(schema, keepPaths, structuralTexts) {
    const keep = keepPaths || ['theme', 'footer'];
    const texts = structuralTexts || new Set();
    function walk(node, keepThis) {
      if (Array.isArray(node)) {
        if (!node.length) return [];
        // Inside a kept subtree (the footer boilerplate) the whole list stays:
        // the design needs it to know how to draw each social platform, and
        // the mapping replaces the list with the user's own links anyway.
        if (keepThis) return node.map(item => walk(item, true));
        // Keep the shape, lose the content: one blank element.
        return [walk(node[0], keepThis)];
      }
      if (node && typeof node === 'object') {
        const out = {};
        for (const key of Object.keys(node)) {
          out[key] = walk(node[key], keepThis || keep.indexOf(key) !== -1);
        }
        return out;
      }
      if (keepThis) return node;
      if (typeof node === 'string') {
        const trimmed = node.trim();
        if (trimmed.length >= 2 && texts.has(trimmed)) return node;
        return '';
      }
      if (typeof node === 'number') return 0;
      if (typeof node === 'boolean') return false;
      return '';
    }
    return walk(schema, false);
  }

  /** Visible text of the template's own HTML — its labels and headings. */
  function structuralTextsFrom(html) {
    const set = new Set();
    let stripped = String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, '\n');
    stripped.split('\n').forEach(line => {
      const t = line.trim();
      if (t.length >= 2) set.add(t);
    });
    return set;
  }

  /** Find the template's own sample photo so the preview still looks right. */
  function findSamplePhoto(schema) {
    function walk(node, path) {
      if (typeof node === 'string') {
        if (/assets\/.*\.(jpg|jpeg|png|webp)$/i.test(node)) return { path: path, value: node };
        return null;
      }
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          const hit = walk(node[i], path ? path + '.' + i : String(i));
          if (hit) return hit;
        }
        return null;
      }
      if (node && typeof node === 'object') {
        for (const key of Object.keys(node)) {
          const hit = walk(node[key], path ? path + '.' + key : key);
          if (hit) return hit;
        }
      }
      return null;
    }
    return walk(schema, '');
  }

  /**
   * Drop repeatable items the user has not filled in yet, so an in-progress
   * item never renders as an empty entry on the site.
   */
  function pruneEmptyItems(data, schemaFields) {
    const fields = schemaFields || (typeof MASTER_SCHEMA !== 'undefined' ? MASTER_SCHEMA : []);
    const out = deepClone(data);
    fields.forEach(field => {
      if (field.type !== 'repeatable') return;
      const arr = getPath(out, field.path);
      if (!Array.isArray(arr)) return;
      setPath(out, field.path, arr.filter(item => Object.keys(item).some(key => {
        const value = item[key];
        if (Array.isArray(value)) return value.length > 0;
        return value !== '' && value !== null && value !== undefined && value !== 0;
      })));
    });
    return out;
  }

  function sectionMapFor(templateKey) {
    return TEMPLATE_SECTIONS[templateKey] || [];
  }

  /** Sections the user chose to leave out of the preview and the site. */
  function getHiddenSections() {
    const list = state.canonical.ui && state.canonical.ui.hiddenSections;
    return Array.isArray(list) ? list.slice() : [];
  }

  function isSectionHidden(sectionId) {
    return getHiddenSections().indexOf(sectionId) !== -1;
  }

  function setSectionHidden(sectionId, hidden) {
    if (!state.canonical.ui) state.canonical.ui = {};
    const next = getHiddenSections().filter(id => id !== sectionId);
    if (hidden) next.push(sectionId);
    if (next.length) state.canonical.ui.hiddenSections = next;
    else delete state.canonical.ui.hiddenSections;
    renderStructure();
    refreshPreview();
  }

  function templateParts() {
    const styleKey = templateSelect.value;
    const schemaName = STYLE_KEY_TO_SCHEMA_NAME[styleKey] || styleKey;
    const schema = ALL_TEMPLATE_SCHEMAS.resume_templates[schemaName];
    const mapping = MAPPINGS[styleKey];
    if (!schema || !mapping) return null;
    return { styleKey: styleKey, schema: schema, mapping: mapping };
  }

  /**
   * A master field only reaches the page if the active template's mapping
   * consumes it. Used by `showWhenMapped` fields (e.g. style14's stat cards)
   * so a control never appears for a design that has nowhere to put it.
   */
  function mappingUsesField(mapping, path) {
    if (!mapping || !path) return false;
    const top = path.split('.')[0];
    const owns = obj => !!obj && Object.prototype.hasOwnProperty.call(obj, path);

    if (owns(mapping.scalar)) return true;
    if (owns(mapping.arrays)) return true;
    if (owns(mapping.objectMap)) return true;
    if (owns(mapping.labelValueArray)) return true;
    if (mapping.groupedArrays) {
      for (const cfg of Object.values(mapping.groupedArrays)) {
        if ((cfg.groups || []).some(g => g.sourcePath === top)) return true;
      }
    }
    if (mapping.compose) {
      for (const cfg of Object.values(mapping.compose)) {
        if (cfg && typeof cfg.template === 'string' && cfg.template.indexOf('{' + path + '}') !== -1) return true;
      }
    }
    return false;
  }

  /**
   * Replace the template's sample name with the user's — the same swap the
   * publish path does, so the editor preview and the live site agree.
   * With no name yet, the sample name is removed rather than left behind.
   */
  function swapSampleNames(node, schema, userName) {
    if (!node || typeof node !== 'object') return;
    const names = [];
    const srcFooter = schema.footer;
    const srcFooterText = typeof srcFooter === 'string' ? srcFooter : ((srcFooter && srcFooter.text) || '');
    const match = srcFooterText.match(/^\u00a9\s*(?:\{year\}|\d{4}|\[year\])\s*(.*?)\.?\s*All rights reserved/i);
    if (match && match[1]) names.push(match[1]);
    if (schema.profile && schema.profile.name) names.push(schema.profile.name);
    if (!names.length) return;
    const replacement = userName || '';
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      for (const key of Object.keys(node)) {
        if (typeof node[key] === 'string') {
          names.forEach(name => { node[key] = node[key].split(name).join(replacement); });
        } else walk(node[key]);
      }
    })(node);
  }

  /**
   * Map canonical data onto the template's shape, against a scrubbed base so
   * the template's sample content can never leak into the editor.
   */
  function mapCanonical(canonical, schema, mapping, schemaFields, structuralTexts) {
    const scrubbed = scrubBase(schema, null, structuralTexts);
    const result = applyMapping(pruneEmptyItems(canonical, schemaFields), scrubbed, mapping);

    // With no photo uploaded, keep the template's own sample photo so the
    // preview shows a framed portrait rather than a broken image.
    if (!canonical.profileImage) {
      const sample = findSamplePhoto(schema);
      if (sample) setPath(result, sample.path, sample.value);
    }

    // Same idea for image fields whose mapping keeps the design's artwork
    // (e.g. a hero photo): show that default until the user uploads theirs.
    const imageFields = (schemaFields || (typeof MASTER_SCHEMA !== 'undefined' ? MASTER_SCHEMA : []))
      .filter(def => def.type === 'image' && def.path !== 'profileImage');
    imageFields.forEach(def => {
      const spec = mapping.scalar && mapping.scalar[def.path];
      if (!spec || typeof spec !== 'object' || !spec.keepWhenBlank) return;
      if (getPath(canonical, def.path)) return;
      const sample = getPath(schema, spec.path);
      if (sample) setPath(result, spec.path, sample);
    });

    swapSampleNames(result, schema, canonical.fullName || '');
    return result;
  }

  /** Build the template-shaped data the preview renders. */
  function buildTemplateData() {
    const parts = templateParts();
    if (!parts) return null;
    const result = mapCanonical(state.canonical, parts.schema, parts.mapping, undefined, state.structuralTexts);
    // The theme the user picked has to show in the editor canvas too, or the
    // preview would not match the site they are about to publish.
    if (result && typeof window !== 'undefined' && window.userSelectedTheme) {
      result.theme = deepClone(window.userSelectedTheme);
    }
    return result;
  }

  // ---------------------------------------------------------------------
  // The script injected into the preview iframe
  // ---------------------------------------------------------------------
  function buildInjection(sectionMap, initialData, token, initialCss, initialHidden) {
    return `
<style id="rp-user-colors-style">${initialCss || ''}</style>
<style id="rp-editor-style">
  .rp-editor-section { position: relative; }
  .rp-editor-section.rp-editor-clickable { cursor: pointer; }
  .rp-editor-section.rp-editor-selected { outline: 2px solid #2563eb; outline-offset: 3px; }
  .rp-editor-section.rp-editor-empty > * { opacity: .4; }
  .rp-editor-hidden, [data-rp-hidden-link] { display: none !important; }
  .rp-editor-section.rp-editor-empty::before {
    content: 'Empty \\2014 click to fill this section';
    display: block;
    font: 600 12px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #64748b;
    background: rgba(148,163,184,.12);
    border: 1px dashed #94a3b8;
    border-radius: 8px;
    padding: 10px 12px;
    margin: 2px 0 10px;
  }
</style>
<script id="rp-editor-mode">
(function () {
  'use strict';
  var TOKEN = ${safeJson(token)};
  var SECTION_MAP = ${safeJson(sectionMap)};
  var ID_PREFIX_TO_SECTION = ${safeJson(ID_PREFIX_TO_SECTION)};
  var current = ${safeJson(initialData)};
  var hiddenSections = ${safeJson(initialHidden || [])};
  var selected = null;
  var selectedEl = null;

  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = '';
    try { url = typeof input === 'string' ? input : ((input && input.url) || ''); } catch (e) {}
    if (url.indexOf('data.json') !== -1) {
      return Promise.resolve(new Response(JSON.stringify(current || {}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    if (nativeFetch) return nativeFetch(input, init);
    return Promise.reject(new Error('fetch unavailable'));
  };

  function matchExplicit(el) {
    for (var i = 0; i < SECTION_MAP.length; i++) {
      try { if (el.matches(SECTION_MAP[i].selector)) return SECTION_MAP[i]; } catch (e) {}
    }
    return null;
  }

  function matchGeneric(el) {
    var id = (el.id || '').toLowerCase();
    if (!id) return null;
    var isContainer = el.tagName === 'SECTION' || !!el.querySelector('h1,h2,h3,h4,h5,h6');
    if (!isContainer) return null;
    for (var i = 0; i < ID_PREFIX_TO_SECTION.length; i++) {
      if (id.indexOf(ID_PREFIX_TO_SECTION[i][0]) === 0) {
        return { section: ID_PREFIX_TO_SECTION[i][1], selector: '#' + el.id, generic: true };
      }
    }
    return null;
  }

  function matchEntry(el) {
    return matchExplicit(el) || matchGeneric(el);
  }

  function resolveSection(target) {
    var el = target;
    while (el && el.nodeType === 1) {
      var entry = matchEntry(el);
      if (entry) return { entry: entry, el: el };
      el = el.parentElement;
    }
    return null;
  }

  /** True when the section holds no user content (headings and icons aside). */
  function isEmpty(el) {
    var clone = el.cloneNode(true);
    var heads = clone.querySelectorAll('h1,h2,h3,h4,h5,h6');
    for (var i = 0; i < heads.length; i++) heads[i].remove();
    var imgs = clone.querySelectorAll('img');
    for (var j = 0; j < imgs.length; j++) {
      var src = imgs[j].getAttribute('src') || '';
      if (src.indexOf('assets/profile') !== -1) continue;
      return false;
    }
    return clone.textContent.replace(/\\s+/g, '').length === 0;
  }

  function paint() {
    var seen = [];
    SECTION_MAP.forEach(function (entry) {
      var nodes = [];
      try { nodes = document.querySelectorAll(entry.selector); } catch (e) {}
      nodes.forEach(function (el) {
        seen.push(el);
        el.setAttribute('data-rp-section', entry.section);
        el.classList.add('rp-editor-section');
        el.classList.add('rp-editor-clickable');
        var empty = isEmpty(el);
        el.classList.toggle('rp-editor-empty', empty);
        if (empty) el.setAttribute('data-rp-empty', '1');
        else el.removeAttribute('data-rp-empty');
      });
    });

    // Templates without an explicit map get their sections detected here.
    if (!SECTION_MAP.length) {
      var candidates = document.querySelectorAll('section, [id$="ection"], [class~="section-block"]');
      for (var c = 0; c < candidates.length; c++) {
        var hit = matchGeneric(candidates[c]);
        if (!hit || seen.indexOf(candidates[c]) !== -1) continue;
        seen.push(candidates[c]);
        candidates[c].setAttribute('data-rp-section', hit.section);
        candidates[c].classList.add('rp-editor-section');
        candidates[c].classList.add('rp-editor-clickable');
        var isEmptyEl = isEmpty(candidates[c]);
        candidates[c].classList.toggle('rp-editor-empty', isEmptyEl);
        if (isEmptyEl) candidates[c].setAttribute('data-rp-empty', '1');
        else candidates[c].removeAttribute('data-rp-empty');
      }
    }

    // User-hidden sections disappear from the canvas and so do the nav links
    // that point at them, exactly as they will on the published site.
    var hiddenIds = [];
    var markedLinks = document.querySelectorAll('[data-rp-hidden-link]');
    for (var l = 0; l < markedLinks.length; l++) {
      markedLinks[l].removeAttribute('data-rp-hidden-link');
      markedLinks[l].style.removeProperty('display');
    }

    var sections = document.querySelectorAll('[data-rp-section]');
    for (var h = 0; h < sections.length; h++) {
      var sectionId = sections[h].getAttribute('data-rp-section');
      var off = hiddenSections.indexOf(sectionId) !== -1;
      sections[h].classList.toggle('rp-editor-hidden', off);
      if (off && sections[h].id) hiddenIds.push(sections[h].id);
    }
    hiddenIds.forEach(function (id) {
      var safeId = String(id).replace(/["\\\\]/g, '\\\\$&');
      var links = document.querySelectorAll('a[href="#' + safeId + '"]');
      for (var n = 0; n < links.length; n++) {
        var link = links[n].closest('li') || links[n];
        link.setAttribute('data-rp-hidden-link', '1');
        link.style.setProperty('display', 'none', 'important');
      }
    });

    var selectedNodes = document.querySelectorAll('.rp-editor-selected');
    for (var s = 0; s < selectedNodes.length; s++) selectedNodes[s].classList.remove('rp-editor-selected');
    if (selectedEl && document.body.contains(selectedEl)) selectedEl.classList.add('rp-editor-selected');
  }

  function applyHidden(list) {
    hiddenSections = Array.isArray(list) ? list.slice() : [];
    paint();
  }

  function findFirstForSection(sectionId) {
    for (var i = 0; i < SECTION_MAP.length; i++) {
      if (SECTION_MAP[i].section !== sectionId) continue;
      try {
        var n = document.querySelector(SECTION_MAP[i].selector);
        if (n) return n;
      } catch (e) {}
    }
    var all = document.querySelectorAll('section, [id$="ection"]');
    for (var j = 0; j < all.length; j++) {
      var hit = matchGeneric(all[j]);
      if (hit && hit.section === sectionId) return all[j];
    }
    return null;
  }

  function applySelection(sectionId, el) {
    selected = sectionId;
    selectedEl = el || findFirstForSection(sectionId);
    paint();
  }

  // The user's own colour choices arrive as ready-made CSS, so the canvas and
  // the published site are guaranteed to carry exactly the same rules.
  function applyCss(css) {
    var el = document.getElementById('rp-user-colors-style');
    if (!css) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
      return;
    }
    if (!el) {
      el = document.createElement('style');
      el.id = 'rp-user-colors-style';
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent = css;
  }

  function render() {
    try {
      if (typeof window.populateResume === 'function') window.populateResume(current);
      else if (typeof window.render === 'function') window.render(current);
      else if (typeof window.__rpRender === 'function') window.__rpRender(current);
    } catch (err) {
      parent.postMessage({ __rpEditorError: String((err && err.message) || err), __rpToken: TOKEN }, '*');
    }
    setTimeout(paint, 30);
    parent.postMessage({ __rpEditorReady: true, __rpToken: TOKEN }, '*');
  }

  window.addEventListener('message', function (ev) {
    var d = ev.data || {};
    // Ignore messages meant for a different preview: when the template
    // changes, the previous frame may still be alive for a moment.
    if (d.__rpToken !== TOKEN) return;
    if (d.__rpEditorCss !== undefined) {
      applyCss(d.__rpEditorCss);
    }
    if (Array.isArray(d.__rpEditorHidden)) {
      applyHidden(d.__rpEditorHidden);
    }
    if (d.__rpEditorData) {
      current = d.__rpEditorData;
      render();
    } else if (d.__rpEditorSelect) {
      applySelection(d.__rpEditorSelect, null);
    }
  });

  document.addEventListener('click', function (ev) {
    var hit = resolveSection(ev.target);
    if (!hit) return;
    var anchor = ev.target.closest ? ev.target.closest('a') : null;
    if (anchor) ev.preventDefault();
    applySelection(hit.entry.section, hit.el);
    parent.postMessage({ __rpEditorSelect: hit.entry.section, __rpToken: TOKEN }, '*');
  }, true);

  // The template fetches data.json on load; our patched fetch resolves it
  // immediately, so the template renders on its own. Paint a few times while
  // that settles.
  var ticks = 0;
  var timer = setInterval(function () {
    ticks++;
    paint();
    if (ticks > 40) clearInterval(timer);
  }, 150);

  parent.postMessage({ __rpEditorReady: true, __rpToken: TOKEN }, '*');
})();
</script>`;
  }

  // ---------------------------------------------------------------------
  // Panel rendering
  // ---------------------------------------------------------------------
  function renderStructure() {
    const rail = els.structure;
    if (!rail) return;
    rail.innerHTML = '';
    const hint = document.createElement('p');
    hint.className = 'editor-note';
    hint.style.margin = '0 2px 10px';
    hint.textContent = 'Hide a section to leave it out of the preview and the published site.';
    rail.appendChild(hint);
    const map = sectionMapFor(state.templateKey);

    SECTION_ORDER.forEach(sectionId => {
      const fields = MASTER_SCHEMA.filter(f => f.section === sectionId);
      if (!fields.length) return;
      const meta = SECTION_META[sectionId] || { icon: '•', label: sectionId };
      const supported = !map.length || map.some(e => e.section === sectionId);
      const hidden = supported && isSectionHidden(sectionId);

      const item = document.createElement('div');
      item.className = 'editor-section-item';
      if (hidden) item.classList.add('is-hidden');

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'editor-section-btn';
      if (sectionId === state.activeSection) btn.classList.add('is-active');
      if (!supported) btn.classList.add('is-unsupported');

      const icon = document.createElement('span');
      icon.className = 'editor-section-icon';
      icon.textContent = meta.icon;
      const name = document.createElement('span');
      name.className = 'editor-section-name';
      name.textContent = meta.label;
      btn.appendChild(icon);
      btn.appendChild(name);

      if (supported) {
        btn.addEventListener('click', () => selectSection(sectionId));
      } else {
        btn.disabled = true;
        btn.title = 'This design has no ' + meta.label.toLowerCase() + ' section';
      }
      item.appendChild(btn);

      if (supported) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'editor-section-toggle';
        toggle.textContent = hidden ? 'Show' : 'Hide';
        toggle.title = hidden
          ? 'Show this section in the preview and the published site'
          : 'Hide this section from the preview and the published site';
        toggle.setAttribute('aria-label', (hidden ? 'Show ' : 'Hide ') + meta.label + ' section');
        toggle.addEventListener('click', (ev) => {
          ev.stopPropagation();
          setSectionHidden(sectionId, !hidden);
        });
        item.appendChild(toggle);
      }
      rail.appendChild(item);
    });

    // The page frame (header, hero, footer) is not a content section, but it
    // is where a theme repaints the page — so it gets its own entry.
    const designBtn = document.createElement('button');
    designBtn.type = 'button';
    designBtn.className = 'editor-section-btn editor-design-btn';
    if (state.activeSection === DESIGN_VIEW) designBtn.classList.add('is-active');
    const designIcon = document.createElement('span');
    designIcon.className = 'editor-section-icon';
    designIcon.textContent = '🎨';
    const designName = document.createElement('span');
    designName.className = 'editor-section-name';
    designName.textContent = 'Page frame';
    designBtn.appendChild(designIcon);
    designBtn.appendChild(designName);
    designBtn.addEventListener('click', () => selectSection(DESIGN_VIEW));
    rail.appendChild(designBtn);
  }

  // ---------------------------------------------------------------------
  // Colour overrides
  // ---------------------------------------------------------------------

  /** The user's colour choices, as { scopeId: { text, heading } }. */
  function getColors() {
    return (state.canonical.ui && state.canonical.ui.colors) || {};
  }

  function setScopeColor(scopeId, key, value) {
    if (!state.canonical.ui) state.canonical.ui = {};
    if (!state.canonical.ui.colors) state.canonical.ui.colors = {};
    const map = state.canonical.ui.colors;
    const cur = map[scopeId] || {};
    const v = (value || '').trim();
    if (!v) delete cur[key];
    else cur[key] = v;
    if (Object.keys(cur).length) map[scopeId] = cur;
    else delete map[scopeId];
  }

  /** The CSS that carries those choices into the preview. */
  function colorsCss() {
    return COLORS ? COLORS.buildCss(getColors()) : '';
  }

  /** One colour row: a swatch, a hex field and a reset link. */
  function buildColorRow(scopeId, key, label) {
    const wrap = document.createElement('div');
    wrap.className = 'editor-color-row';

    const name = document.createElement('span');
    name.className = 'editor-color-label';
    name.textContent = label;
    wrap.appendChild(name);

    const controls = document.createElement('div');
    controls.className = 'editor-color-controls';

    const current = (getColors()[scopeId] || {})[key] || '';
    const swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.className = 'editor-color-swatch';
    swatch.value = current || '#6b7280';
    if (!current) swatch.classList.add('is-default');
    swatch.setAttribute('aria-label', label);

    const hex = document.createElement('input');
    hex.type = 'text';
    hex.className = 'editor-color-hex';
    hex.placeholder = 'design default';
    hex.value = current;
    hex.maxLength = 7;
    hex.setAttribute('aria-label', label + ' hex value');

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'editor-color-reset';
    reset.textContent = 'Reset';
    reset.title = 'Use the design’s own colour';

    function apply(value) {
      const clean = COLORS ? COLORS.safeColor(value) : value;
      if (!clean) return;
      setScopeColor(scopeId, key, clean);
      swatch.value = clean;
      hex.value = clean;
      swatch.classList.remove('is-default');
      commit();
      refreshPreview();
    }

    swatch.addEventListener('input', () => apply(swatch.value));
    hex.addEventListener('change', () => {
      const clean = COLORS ? COLORS.safeColor(hex.value) : hex.value;
      if (!clean) { hex.value = (getColors()[scopeId] || {})[key] || ''; return; }
      apply(clean);
    });
    reset.addEventListener('click', () => {
      setScopeColor(scopeId, key, '');
      hex.value = '';
      swatch.value = '#6b7280';
      swatch.classList.add('is-default');
      commit();
      refreshPreview();
    });

    controls.appendChild(swatch);
    controls.appendChild(hex);
    controls.appendChild(reset);
    wrap.appendChild(controls);
    return wrap;
  }

  /** The colour block for one scope. */
  function buildColorBlock(scopeId, title, note) {
    const block = document.createElement('div');
    block.className = 'editor-colors';

    const head = document.createElement('div');
    head.className = 'editor-subhead';
    head.textContent = title;
    block.appendChild(head);

    if (note) {
      const hint = document.createElement('p');
      hint.className = 'editor-note';
      hint.textContent = note;
      block.appendChild(hint);
    }

    block.appendChild(buildColorRow(scopeId, 'text', 'Text colour'));
    block.appendChild(buildColorRow(scopeId, 'heading', 'Heading colour'));
    return block;
  }

  /** The panel for the page frame: header, hero and footer colours. */
  function buildDesignPanel() {
    const wrap = document.createElement('div');
    const intro = document.createElement('p');
    intro.className = 'editor-note';
    intro.textContent = 'A theme repaints the header, hero and footer. Set a colour here when a theme leaves text unreadable.';
    wrap.appendChild(intro);

    (COLORS ? COLORS.FRAME_SCOPES : []).forEach(scope => {
      const meta = (COLORS && COLORS.SCOPE_META[scope]) || { label: scope };
      wrap.appendChild(buildColorBlock(scope, meta.label + ' colours'));
    });
    return wrap;
  }

  function renderProperties() {
    const panel = els.properties;
    if (!panel) return;
    panel.innerHTML = '';

    if (state.activeSection === DESIGN_VIEW) {
      panel.appendChild(buildDesignPanel());
      return;
    }

    const parts = templateParts();
    const fields = MASTER_SCHEMA.filter(f =>
      f.section === state.activeSection &&
      (!f.showWhenMapped || mappingUsesField(parts && parts.mapping, f.path))
    );
    if (!fields.length) {
      const note = document.createElement('p');
      note.className = 'editor-note';
      note.textContent = 'Nothing to edit in this section.';
      panel.appendChild(note);
      return;
    }

    // Some designs put the social links in the footer instead of the contact
    // block — say so, so the user knows where their links will show up.
    if (state.activeSection === 'Contact') {
      const cfg = parts && parts.mapping.arrays && parts.mapping.arrays.socialLinks;
      if (cfg && /^footer/i.test(cfg.targetPath || '')) {
        const note = document.createElement('p');
        note.className = 'editor-note';
        note.textContent = 'In this design your social links appear in the footer.';
        panel.appendChild(note);
      }
    }

    fields.forEach(field => {
      if (field.type === 'image') panel.appendChild(buildImageEditor(field));
      else if (field.type === 'repeatable') panel.appendChild(buildRepeatableEditor(field));
      else panel.appendChild(buildSimpleEditor(field));
    });

    if (COLORS) {
      const meta = SECTION_META[state.activeSection];
      const label = (meta ? meta.label : state.activeSection) + ' colours';
      panel.appendChild(buildColorBlock(state.activeSection, label,
        'Leave these on the design’s own colours unless a theme makes the text hard to read.'));
    }
  }

  function buildSimpleEditor(field) {
    const wrap = buildSimpleField(field);
    const input = wrap.querySelector('.master-field');
    const value = getPath(state.canonical, field.path);
    input.value = (value === undefined || value === null) ? '' : value;
    return wrap;
  }

  function buildImageEditor(field) {
    const wrap = buildImageField(field);
    const img = wrap.querySelector('.img-preview');
    const existing = getPath(state.canonical, field.path) ||
      (typeof imageDataUris !== 'undefined' && imageDataUris[field.path]) ||
      (field.path === 'profileImage' ? profileImageDataUri : '');
    if (img && existing) img.src = existing;
    return wrap;
  }

  function buildRepeatableEditor(field) {
    const wrap = buildRepeatableField(field);
    const container = wrap.querySelector('.items-container');
    container.innerHTML = '';
    const items = getPath(state.canonical, field.path);
    if (Array.isArray(items) && items.length) {
      items.forEach(item => addRepeatableItem(container, field, item));
    } else {
      addRepeatableItem(container, field);
    }
    return wrap;
  }

  // ---------------------------------------------------------------------
  // Data flow
  // ---------------------------------------------------------------------

  /** Pull the visible panel's values back into the canonical data. */
  function commit() {
    const panel = els.properties;
    if (!panel) return;

    panel.querySelectorAll('.master-field').forEach(input => {
      setPath(state.canonical, input.dataset.path, input.value.trim());
    });

    panel.querySelectorAll('[data-repeatable-path]').forEach(wrap => {
      const path = wrap.dataset.repeatablePath;
      const def = MASTER_SCHEMA.find(f => f.path === path);
      if (!def) return;
      const items = [];
      wrap.querySelectorAll('.item-card').forEach(card => {
        const item = {};
        def.itemFields.forEach(itemField => {
          const input = card.querySelector('[data-item-field="' + itemField.path + '"]');
          if (!input) return;
          let value = input.value.trim();
          if (itemField.type === 'number') value = value ? Number(value) : 0;
          if (itemField.type === 'textarea-lines') {
            value = value.split('\n').map(s => s.trim()).filter(Boolean);
          }
          item[itemField.path] = value;
        });
        items.push(item);
      });
      setPath(state.canonical, path, items);
    });

    MASTER_SCHEMA.forEach(def => {
      if (def.type !== 'image') return;
      const uri = (typeof imageDataUris !== 'undefined' && imageDataUris[def.path]) ||
        (def.path === 'profileImage' ? profileImageDataUri : '');
      if (uri) setPath(state.canonical, def.path, uri);
    });
  }

  function postToPreview(message) {
    if (!els.preview || !els.preview.contentWindow) return;
    try {
      message.__rpToken = state.previewToken;
      els.preview.contentWindow.postMessage(message, '*');
    } catch (err) { /* frame not ready yet */ }
  }

  function refreshPreview() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      const data = buildTemplateData();
      if (data) postToPreview({ __rpEditorData: data, __rpEditorCss: colorsCss(), __rpEditorHidden: getHiddenSections() });
    }, 120);
  }

  function selectSection(sectionId) {
    commit();
    state.activeSection = sectionId;
    // Selecting a hidden section brings it back, so the user can see the
    // content they are about to edit. It can be hidden again with its toggle.
    if (sectionId !== DESIGN_VIEW && isSectionHidden(sectionId)) {
      const next = getHiddenSections().filter(id => id !== sectionId);
      if (next.length) state.canonical.ui.hiddenSections = next;
      else delete state.canonical.ui.hiddenSections;
      refreshPreview();
    }
    renderStructure();
    renderProperties();
    postToPreview({ __rpEditorSelect: sectionId });
  }

  function focusField(path) {
    const def = MASTER_SCHEMA.find(f => f.path === path);
    if (!def) return;
    selectSection(def.section);
    const input = els.properties.querySelector('.master-field[data-path="' + path + '"]');
    if (input) { input.focus(); input.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  async function loadPreviewDocument() {
    const styleKey = templateSelect.value;
    const templateKey = 'resume/' + styleKey;
    state.templateKey = templateKey;

    // A fresh token per load: the previous frame may still be alive for a
    // moment and must not be handed data shaped for the new template.
    const token = 'rp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    state.previewToken = token;
    state.ready = false;

    const map = sectionMapFor(templateKey);
    if (els.canvasTitle) els.canvasTitle.textContent = 'Loading preview…';

    try {
      const res = await fetch(TEMPLATES_BASE + '/' + templateKey + '/index.html');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      let html = await res.text();

      // The template's own labels and headings are structure, not sample
      // content — keep them so nav and section titles still render.
      state.structuralTexts = structuralTextsFrom(html);

      const data = buildTemplateData() || {};

      const base = new URL(TEMPLATES_BASE + '/' + templateKey + '/', window.location.href).href;
      const head = '<base href="' + base + '">' + buildInjection(map, data, token, colorsCss(), getHiddenSections());
      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, m => m + head);
      } else {
        html = head + html;
      }
      if (state.blobUrl) URL.revokeObjectURL(state.blobUrl);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      state.blobUrl = URL.createObjectURL(blob);
      const blobUrl = state.blobUrl;

      // Tear the old frame down first, then load the new one.
      els.preview.src = 'about:blank';
      setTimeout(() => {
        if (state.previewToken !== token) return;   // superseded by a newer load
        els.preview.src = blobUrl;
      }, 0);
    } catch (err) {
      console.error('[resume-editor] preview failed', err);
      if (els.canvasTitle) els.canvasTitle.textContent = 'Preview unavailable for this design';
    }
  }

  function setCanonical(data) {
    state.canonical = (data && typeof data === 'object') ? deepClone(data) : {};
    MASTER_SCHEMA.forEach(def => {
      if (def.type !== 'image' || getPath(state.canonical, def.path)) return;
      const uri = (typeof imageDataUris !== 'undefined' && imageDataUris[def.path]) ||
        (def.path === 'profileImage' ? profileImageDataUri : '');
      if (uri) setPath(state.canonical, def.path, uri);
    });
    renderStructure();
    renderProperties();
    refreshPreview();
  }

  /**
   * The data to build the site from. Blank repeatable items the user has
   * started but not filled in are dropped here — they stay in the canonical
   * model (so the panel never loses what someone is typing) but must never
   * reach the template as empty entries.
   */
  function getCanonical() {
    commit();
    return pruneEmptyItems(state.canonical);
  }

  function onMessage(event) {
    const data = event.data || {};
    // Only the current preview frame may drive the editor.
    if (data.__rpToken !== state.previewToken) return;
    if (data.__rpEditorSelect) {
      if (data.__rpEditorSelect !== state.activeSection) selectSection(data.__rpEditorSelect);
    } else if (data.__rpEditorReady) {
      state.ready = true;
      if (els.canvasTitle) els.canvasTitle.textContent = 'Live preview';
      const built = buildTemplateData();
      if (built) postToPreview({ __rpEditorData: built });
      postToPreview({ __rpEditorSelect: state.activeSection });
      postToPreview({ __rpEditorHidden: getHiddenSections() });
    } else if (data.__rpEditorError) {
      if (els.canvasTitle) els.canvasTitle.textContent = 'Preview error: ' + data.__rpEditorError;
    }
  }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------
  function init() {
    els.structure = document.getElementById('editorStructure');
    els.properties = document.getElementById('resumeForm');
    els.preview = document.getElementById('editorPreview');
    els.canvasTitle = document.getElementById('editorCanvasTitle');
    if (!els.structure || !els.properties || !els.preview) return false;

    els.properties.addEventListener('input', () => { commit(); refreshPreview(); });
    els.properties.addEventListener('click', () => { commit(); refreshPreview(); });

    window.addEventListener('message', onMessage);

    // The theme picker lives in preview-and-download.js. When the user picks
    // a theme, the canvas has to show it — otherwise the editor preview and
    // the published site disagree.
    window.addEventListener('rpThemeChange', () => {
      commit();
      refreshPreview();
    });

    templateSelect.addEventListener('change', () => {
      loadPreviewDocument();
      renderStructure();
    });

    // The rail shows which sections the template actually has, so the template
    // key has to be current before the first render.
    state.templateKey = 'resume/' + templateSelect.value;
    renderStructure();
    renderProperties();
    loadPreviewDocument();
    return true;
  }

  if (!IS_NODE) {
    window.ResumeEditor = {
      init: init,
      isActive: () => !!(els.structure && els.properties && els.preview),
      commit: commit,
      getCanonical: getCanonical,
      setCanonical: setCanonical,
      focusField: focusField,
      selectSection: selectSection
    };
    // Tell the page the editor is available (it may be waiting on us).
    if (typeof window.__rpEditorResolve === 'function') window.__rpEditorResolve(true);
  }

  if (IS_NODE) {
    module.exports = {
      scrubBase: scrubBase,
      pruneEmptyItems: pruneEmptyItems,
      safeJson: safeJson,
      mapCanonical: mapCanonical,
      buildInjection: buildInjection,
      findSamplePhoto: findSamplePhoto,
      structuralTextsFrom: structuralTextsFrom,
      swapSampleNames: swapSampleNames
    };
  }
})();
