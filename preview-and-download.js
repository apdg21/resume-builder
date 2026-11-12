/*
  ADD-ON MODULE: preview + full-site download + publish
  ---------------------------------------------
  Drop this <script> block into your existing resume-portfolio-builder/index.html,
  after your existing generate.js logic (i.e. after `lastResult` gets set from
  the /api/generate response). It expects these globals to already exist from
  your current page:
    - lastResult        (the filled data.json object returned by /api/generate)
    - categorySelect     (the <select> for resume/portfolio)
    - templateSelect     (the <select> for style1..style20 etc.)

  It adds three things to the page automatically: a live preview (opens in a
  full-screen modal), a "Download full site (.zip)" button, and a
  "Publish now" button that pushes the site to a GitHub branch (which a
  connected Cloudflare Pages project auto-builds into a live URL), all
  driven by TEMPLATES_BASE + manifests.json.

  IMPORTANT: templates only exist for combos present in
  /templates/manifests.json. Right now that's resume/style1 and
  portfolio/style1 — see README for how to add the rest.
*/

const TEMPLATES_BASE = 'templates'; // relative to this page's own location — works no matter what subfolder the site is served from

let manifestsCache = null;

async function getManifests() {
  if (manifestsCache) return manifestsCache;
  const res = await fetch(`${TEMPLATES_BASE}/manifests.json`);
  manifestsCache = await res.json();
  return manifestsCache;
}

// --- PROFILE PHOTO FIELD DETECTION -------------------------------------
function findProfileImagePath(schemaObj, path = '') {
  if (schemaObj && typeof schemaObj === 'object' && !Array.isArray(schemaObj)) {
    for (const [key, value] of Object.entries(schemaObj)) {
      const newPath = path ? `${path}.${key}` : key;
      if (typeof value === 'string' && value === 'assets/profile.jpg') {
        return newPath;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const found = findProfileImagePath(value, newPath);
        if (found) return found;
      }
    }
  }
  return null;
}

function setPathGeneric(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

function mergeProfilePhoto(generatedData, originalTemplateSchema, photoDataUri) {
  if (!photoDataUri) return generatedData;
  const imagePath = findProfileImagePath(originalTemplateSchema);
  if (!imagePath) return generatedData;
  setPathGeneric(generatedData, imagePath, photoDataUri);
  return generatedData;
}

// index.html's dropdown is populated from all_template_schemas.json, whose
// keys are ALL-CAPS display names (TIMELESS, VIVID, ...) -- NOT the style1..
// style20 folder names used on disk and by resume-form.html. Without this
// map, templateKey() would return "resume/VIVID" on index.html but
// "resume/style4" on resume-form.html for the exact same template, breaking
// both the preview file lookup and license verification on whichever page
// isn't using the style1..style20 form.
const NAME_TO_STYLE_KEY = {
  TIMELESS: "style1",
  SLEEK: "style2",
  EXECUTIVE: "style3",
  VIVID: "style4",
  PURE: "style5",
  REFINED: "style6",
  DYNAMIC: "style7",
  SKILLFOCUS: "style8",
  CORPORATE: "style9",
  TRENDY: "style10",
  HORIZON: "style11",
  MIDNIGHT: "style12",
  EMBER: "style13",
  CANVAS: "style14",
  GRAPHITE: "style15",
  IVORY: "style16",
  STORM: "style17",
  LINEN: "style18",
  PRISM: "style19",
  OBSIDIAN: "style20",
  AURORA: "style21",
  MERIDIAN: "style22",
};

function templateKey() {
  const cat = (typeof categorySelect !== 'undefined' && categorySelect)
    ? (categorySelect.value === 'resume_templates' ? 'resume' : 'portfolio')
    : 'resume';
  const rawStyle = (typeof templateSelect !== 'undefined' && templateSelect) ? templateSelect.value : 'style1';
  // Normalize display-name keys (VIVID, TIMELESS, ...) down to the folder
  // name (style4, style1, ...) so both pages always agree on the same key.
  const style = NAME_TO_STYLE_KEY[rawStyle] || rawStyle;
  return `${cat}/${style}`;
}

const CHECKOUT_URL_BY_TEMPLATE = {
  "resume/style1": "https://resumeprotemplate.gumroad.com/l/generated-resume-timeless",
  "resume/style2": "https://resumeprotemplate.gumroad.com/l/generated-resume-sleek",
  "resume/style3": "https://resumeprotemplate.gumroad.com/l/generated-resume-executive",
  "resume/style4": "https://resumeprotemplate.gumroad.com/l/generated-resume-vivid",
  "resume/style5": "https://resumeprotemplate.gumroad.com/l/generated-resume-pure",
  "resume/style6": "https://resumeprotemplate.gumroad.com/l/generated-resume-refined",
  "resume/style7": "https://resumeprotemplate.gumroad.com/l/generated-resume-dynamic",
  "resume/style8": "https://resumeprotemplate.gumroad.com/l/generated-resume-skillfocus",
  "resume/style9": "https://resumeprotemplate.gumroad.com/l/generated-resume-corporate",
  "resume/style10": "https://resumeprotemplate.gumroad.com/l/generated-resume-trendy",
  "resume/style11": "https://resumeprotemplate.gumroad.com/l/generated-resume-horizon",
  "resume/style12": "https://resumeprotemplate.gumroad.com/l/generated-resume-midnight",
  "resume/style13": "https://resumeprotemplate.gumroad.com/l/generated-resume-ember",
  "resume/style14": "https://resumeprotemplate.gumroad.com/l/generated-resume-canvas",
  "resume/style15": "https://resumeprotemplate.gumroad.com/l/generated-resume-graphite",
  "resume/style16": "https://resumeprotemplate.gumroad.com/l/generated-resume-ivory",
  "resume/style17": "https://resumeprotemplate.gumroad.com/l/generated-resume-storm",
  "resume/style18": "https://resumeprotemplate.gumroad.com/l/generated-resume-linen",
  "resume/style19": "https://resumeprotemplate.gumroad.com/l/generated-resume-prism",
  "resume/style20": "https://resumeprotemplate.gumroad.com/l/generated-resume-obsidian",
  "resume/style21": "https://resumeprotemplate.gumroad.com/l/generated-resume-aurora",
  "resume/style22": "https://resumeprotemplate.gumroad.com/l/generated-resume-meridian",
};
const DEFAULT_CHECKOUT_URL = "https://resumeprotemplate.gumroad.com/l/generated-resume";

function getCheckoutUrl() {
  const key = templateKey();
  return (typeof CHECKOUT_URL_BY_TEMPLATE !== 'undefined' && CHECKOUT_URL_BY_TEMPLATE[key])
    || (typeof DEFAULT_CHECKOUT_URL !== 'undefined' && DEFAULT_CHECKOUT_URL)
    || "https://resumeprotemplate.gumroad.com/l/generated-resume";
}

// --- MODAL SCAFFOLDING ---------------------------------------------------
// Built once, reused for every preview. Sits outside the normal page flow
// (position:fixed, full viewport) so it's never constrained by the
// surrounding page's grid/column layout — that's what actually fixes the
// overflow/squeeze problem, rather than tuning pixel widths.
let modalEls = null;

// --- COLOR & THEME CUSTOMIZATION SYSTEM ---------------------------------
const THEME_PRESETS = {
  'default': { name: 'Default', theme: null },
  'dark-slate': {
    name: 'Dark Slate',
    theme: {
      gradientStart: '#0f172a',
      gradientEnd: '#1e293b',
      accentColor: '#38bdf8',
      textColor: '#e2e8f0',
      headingColor: '#ffffff'
    }
  },
  'clean-light': {
    name: 'Clean Light',
    theme: {
      gradientStart: '#ffffff',
      gradientEnd: '#f8fafc',
      accentColor: '#2563eb',
      textColor: '#334155',
      headingColor: '#0f172a'
    }
  },
  'executive-navy': {
    name: 'Executive Navy',
    theme: {
      gradientStart: '#0a192f',
      gradientEnd: '#172a45',
      accentColor: '#64ffda',
      textColor: '#ccd6f6',
      headingColor: '#ffffff'
    }
  },
  'warm-linen': {
    name: 'Warm Linen',
    theme: {
      gradientStart: '#fdfbf7',
      gradientEnd: '#f4ede4',
      accentColor: '#c2410c',
      textColor: '#292524',
      headingColor: '#0c0a09'
    }
  },
  'emerald': {
    name: 'Emerald',
    theme: {
      gradientStart: '#064e3b',
      gradientEnd: '#022c22',
      accentColor: '#34d399',
      textColor: '#ecfdf5',
      headingColor: '#ffffff'
    }
  },
  'amethyst': {
    name: 'Amethyst',
    theme: {
      gradientStart: '#1e1b4b',
      gradientEnd: '#2e1065',
      accentColor: '#a855f7',
      textColor: '#f5f3ff',
      headingColor: '#ffffff'
    }
  }
};

let currentThemeId = 'default';
let currentThemeData = null;

function syncCustomInputs(themeObj) {
  if (!themeObj) return;
  const g1 = themeObj.gradientStart || '#0f172a';
  const g2 = themeObj.gradientEnd || '#1e293b';
  const txt = themeObj.textColor || '#f8fafc';
  const ac = themeObj.accentColor || '#38bdf8';

  // Modal custom inputs
  const mBg1 = document.getElementById('modalBg1');
  if (mBg1) { mBg1.value = g1; const s = document.getElementById('modalBg1Val'); if (s) s.textContent = g1; }
  const mBg2 = document.getElementById('modalBg2');
  if (mBg2) { mBg2.value = g2; const s = document.getElementById('modalBg2Val'); if (s) s.textContent = g2; }
  const mTxt = document.getElementById('modalText');
  if (mTxt) { mTxt.value = txt; const s = document.getElementById('modalTextVal'); if (s) s.textContent = txt; }
  const mAc = document.getElementById('modalAccent');
  if (mAc) { mAc.value = ac; const s = document.getElementById('modalAccentVal'); if (s) s.textContent = ac; }

  // Page custom inputs
  const pBg1 = document.getElementById('customBgStart');
  if (pBg1) { pBg1.value = g1; const s = document.getElementById('customBgStartVal'); if (s) s.textContent = g1; }
  const pBg2 = document.getElementById('customBgEnd');
  if (pBg2) { pBg2.value = g2; const s = document.getElementById('customBgEndVal'); if (s) s.textContent = g2; }
  const pTxt = document.getElementById('customTextColor');
  if (pTxt) { pTxt.value = txt; const s = document.getElementById('customTextColorVal'); if (s) s.textContent = txt; }
  const pAc = document.getElementById('customAccent');
  if (pAc) { pAc.value = ac; const s = document.getElementById('customAccentVal'); if (s) s.textContent = ac; }
}

function toggleModalCustomDrawer() {
  const drawer = document.getElementById('previewCustomDrawer');
  if (!drawer) return;
  const isHidden = drawer.style.display === 'none' || !drawer.style.display;
  drawer.style.display = isHidden ? 'flex' : 'none';
  if (isHidden && currentThemeData) {
    syncCustomInputs(currentThemeData);
  }
}

function selectTheme(id, themeObj) {
  currentThemeId = id;
  currentThemeData = themeObj;
  window.userSelectedTheme = themeObj;

  // Update modal header buttons if visible
  const modalBar = document.getElementById('previewThemeBar');
  if (modalBar) {
    modalBar.querySelectorAll('button[data-theme-id]').forEach(btn => {
      const isCur = btn.dataset.themeId === id;
      btn.style.background = isCur ? '#4f46e5' : '#f3f4f6';
      btn.style.borderColor = isCur ? '#4338ca' : '#d1d5db';
      btn.style.color = isCur ? '#ffffff' : '#374151';
      btn.style.fontWeight = isCur ? '700' : '500';
    });
    const modalCustomizeBtn = document.getElementById('previewCustomizeBtn');
    if (modalCustomizeBtn) {
      const isCur = id === 'custom';
      modalCustomizeBtn.style.background = isCur ? '#4f46e5' : '#f3f4f6';
      modalCustomizeBtn.style.borderColor = isCur ? '#4338ca' : '#d1d5db';
      modalCustomizeBtn.style.color = isCur ? '#ffffff' : '#374151';
      modalCustomizeBtn.style.fontWeight = isCur ? '700' : '600';
    }
  }

  if (themeObj) {
    syncCustomInputs(themeObj);
  }

  // Update page theme pills
  document.querySelectorAll('#themePickerGrid .theme-pill').forEach(pill => {
    if (pill.dataset.themeId === id) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });

  // Toggle custom color box on main page
  const customBox = document.getElementById('customColorBox');
  if (customBox) {
    customBox.style.display = (id === 'custom') ? 'block' : 'none';
  }

  // Update badge in step 3
  const badge = document.getElementById('activeThemeBadge');
  if (badge) {
    const p = THEME_PRESETS[id];
    badge.textContent = p ? p.name : (id === 'custom' ? 'Custom' : 'Default');
  }

  // Apply to lastResult
  const targetResult = (typeof lastResult !== 'undefined' && lastResult) || window.lastResult;
  if (targetResult) {
    if (themeObj) {
      targetResult.theme = JSON.parse(JSON.stringify(themeObj));
    } else {
      delete targetResult.theme;
    }
    const jBox = document.getElementById('jsonBox') || document.getElementById('resultBox');
    if (jBox) {
      jBox.textContent = JSON.stringify(targetResult, null, 2);
    }
  }

  // Live update preview iframe if open
  const iframe = document.getElementById('previewModalIframe');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({ __previewTheme: themeObj }, '*');
    const modalStatus = document.getElementById('previewModalStatus');
    if (modalStatus) {
      const p = THEME_PRESETS[id];
      const name = p ? p.name : (id === 'custom' ? 'Custom' : 'Default');
      modalStatus.textContent = '● ' + name;
      modalStatus.style.color = '#4338ca';
    }
  }

  // Tell the section editor to repaint its canvas with the new theme, so the
  // editor preview and the published site stay in agreement.
  try {
    window.dispatchEvent(new CustomEvent('rpThemeChange', { detail: themeObj || null }));
  } catch (err) { /* older browsers */ }
}

function initThemePicker() {
  const grid = document.getElementById('themePickerGrid');
  if (!grid) return;

  const getCustomThemeObj = () => {
    const bg1 = document.getElementById('customBgStart')?.value || '#0f172a';
    const bg2 = document.getElementById('customBgEnd')?.value || '#1e293b';
    const txt = document.getElementById('customTextColor')?.value || '#f8fafc';
    const ac = document.getElementById('customAccent')?.value || '#38bdf8';
    return {
      gradientStart: bg1,
      gradientEnd: bg2,
      textColor: txt,
      headingColor: txt,
      accentColor: ac
    };
  };

  grid.querySelectorAll('.theme-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const id = pill.dataset.themeId;
      if (id === 'custom') {
        selectTheme('custom', getCustomThemeObj());
      } else {
        const p = THEME_PRESETS[id];
        selectTheme(id, p ? p.theme : null);
      }
    });
  });

  ['customBgStart', 'customBgEnd', 'customTextColor', 'customAccent'].forEach(inputId => {
    const el = document.getElementById(inputId);
    if (!el) return;
    const valSpan = document.getElementById(inputId + 'Val');
    el.addEventListener('input', () => {
      if (valSpan) valSpan.textContent = el.value;
      if (currentThemeId === 'custom') {
        selectTheme('custom', getCustomThemeObj());
      }
    });
  });

  document.getElementById('quickLightTextBtn')?.addEventListener('click', () => {
    const tInput = document.getElementById('customTextColor');
    if (tInput) {
      tInput.value = '#f8fafc';
      const valSpan = document.getElementById('customTextColorVal');
      if (valSpan) valSpan.textContent = '#f8fafc';
      if (currentThemeId === 'custom') selectTheme('custom', getCustomThemeObj());
    }
  });

  document.getElementById('quickDarkTextBtn')?.addEventListener('click', () => {
    const tInput = document.getElementById('customTextColor');
    if (tInput) {
      tInput.value = '#0f172a';
      const valSpan = document.getElementById('customTextColorVal');
      if (valSpan) valSpan.textContent = '#0f172a';
      if (currentThemeId === 'custom') selectTheme('custom', getCustomThemeObj());
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initThemePicker);
} else {
  initThemePicker();
}

// --- PREVIEW VIEW MODES (desktop / mobile, normal / full screen) ---
let previewDevice = 'desktop';
let previewFull = false;

// The mobile preview renders inside a fixed phone-sized viewport and is then
// scaled to fit the modal. Stretching the iframe to the modal's own box made
// it short and wide, which does not read as a phone at all.
const PREVIEW_PHONE_W = 390;
const PREVIEW_PHONE_H = 844;
const PREVIEW_PHONE_FRAME = 10;

function applyPreviewView() {
  if (!modalEls) return;
  const { overlay, box, iframeWrap } = modalEls;
  const mobile = previewDevice === 'mobile';

  overlay.style.padding = previewFull ? '0' : '24px';
  box.style.maxWidth = previewFull ? 'none' : '1260px';
  box.style.height = previewFull ? '100vh' : '90vh';
  box.style.borderRadius = previewFull ? '0' : '12px';

  iframeWrap.style.display = 'flex';
  iframeWrap.style.justifyContent = 'center';
  iframeWrap.style.alignItems = 'center';
  iframeWrap.style.padding = '0';
  iframeWrap.style.overflow = 'hidden';
  iframeWrap.style.minHeight = '0';
  iframeWrap.style.position = 'relative';

  const iframe = document.getElementById('previewModalIframe');
  if (iframe) {
    iframe.style.boxSizing = 'border-box';
    iframe.style.maxWidth = 'none';
    iframe.style.maxHeight = 'none';
    iframe.style.background = '#fff';

    if (mobile) {
      const frameW = PREVIEW_PHONE_W + PREVIEW_PHONE_FRAME * 2;
      const frameH = PREVIEW_PHONE_H + PREVIEW_PHONE_FRAME * 2;
      const availW = iframeWrap.clientWidth;
      const availH = iframeWrap.clientHeight;
      const scale = Math.min(
        1,
        availW > 0 ? (availW - 24) / frameW : 0,
        availH > 0 ? (availH - 24) / frameH : 0
      );
      iframe.style.position = 'absolute';
      iframe.style.left = '50%';
      iframe.style.top = '50%';
      iframe.style.width = frameW + 'px';
      iframe.style.height = frameH + 'px';
      iframe.style.border = PREVIEW_PHONE_FRAME + 'px solid #111827';
      iframe.style.borderRadius = '32px';
      iframe.style.transformOrigin = 'center center';
      iframe.style.transform = 'translate(-50%, -50%)' + (scale > 0 ? ' scale(' + scale + ')' : '');
    } else {
      iframe.style.position = 'static';
      iframe.style.left = '';
      iframe.style.top = '';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.style.borderRadius = '0';
      iframe.style.transform = 'none';
    }
  }

  const setActive = (id, on) => {
    const b = document.getElementById(id);
    if (!b) return;
    b.style.background = on ? '#4f46e5' : '#f3f4f6';
    b.style.color = on ? '#ffffff' : '#374151';
    b.style.borderColor = on ? '#4338ca' : '#d1d5db';
  };
  setActive('previewDesktopBtn', !mobile);
  setActive('previewMobileBtn', mobile);
  setActive('previewFullBtn', previewFull);
  const fullBtn = document.getElementById('previewFullBtn');
  if (fullBtn) fullBtn.textContent = previewFull ? 'Exit full screen' : 'Full screen';
}


function triggerPublishFromPreview() {
  const currentObj = currentPreviewData || (typeof lastResult !== 'undefined' && lastResult) || window.lastResult;
  if (!currentObj) {
    alert('Please generate your resume first.');
    return;
  }
  requireLicense(() => publishSite(currentObj));
}


// --- GCASH & PAYMENT OPTIONS MODAL SYSTEM ---
const GCASH_QR_DATA_URI = "data:image/jpeg;base64,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";

let paymentModalEls = null;

function ensurePaymentModal() {
  if (paymentModalEls) return paymentModalEls;

  const overlay = document.createElement('div');
  overlay.id = 'rpPaymentModalOverlay';
  overlay.style.cssText = `
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.75);
    z-index: 100001;
    align-items: center;
    justify-content: center;
    padding: 16px;
    backdrop-filter: blur(6px);
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  const box = document.createElement('div');
  box.id = 'rpPaymentModalBox';
  box.style.cssText = `
    background: #ffffff;
    border-radius: 18px;
    width: 100%;
    max-width: 480px;
    max-height: 92vh;
    overflow-y: auto;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.4);
    position: relative;
    box-sizing: border-box;
    padding: 26px 24px;
    color: #1e293b;
  `;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.innerHTML = '&times;';
  closeBtn.ariaLabel = 'Close payment modal';
  closeBtn.style.cssText = `
    position: absolute;
    top: 14px;
    right: 16px;
    background: #f1f5f9;
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    font-size: 20px;
    line-height: 1;
    color: #64748b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  `;
  closeBtn.addEventListener('click', closePaymentModal);

  // VIEW 1: Choice between GCash and Card
  const choiceView = document.createElement('div');
  choiceView.id = 'rpPaymentChoiceView';

  choiceView.innerHTML = `
    <div style="text-align: center; margin-bottom: 20px;">
      <span style="background: #eff6ff; color: #2563eb; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.05em; display: inline-block; margin-bottom: 8px;">
        Choose Payment Method
      </span>
      <h3 style="margin: 0 0 6px; font-size: 20px; font-weight: 800; color: #0f172a;">Get Your Unlock Key</h3>
      <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.4;">
        Unlock unlimited publishing, live editing, and permanent Cloudflare hosting.
      </p>
    </div>

    <!-- OPTION 1: GCash / QR Ph (Philippines) -->
    <div id="rpSelectGcashBtn" style="border: 2px solid #005ce6; background: #f0f7ff; border-radius: 14px; padding: 16px; margin-bottom: 12px; cursor: pointer; transition: all 0.15s ease; position: relative;">
      <div style="position: absolute; top: -10px; right: 14px; background: #005ce6; color: #ffffff; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 999px; letter-spacing: 0.04em;">
        ★ RECOMMENDED IN PH
      </div>
      <div style="display: flex; align-items: flex-start; gap: 12px;">
        <div style="width: 42px; height: 42px; background: #005ce6; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 20px; flex-shrink: 0;">
          📱
        </div>
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px;">
            <strong style="font-size: 15px; color: #0f172a;">Pay via GCash / QR Ph</strong>
            <span id="rpGcashPrice" style="font-size: 17px; font-weight: 800; color: #005ce6;">₱880</span>
          </div>
          <p style="margin: 0 0 6px; font-size: 12.5px; color: #475569; line-height: 1.35;">
            Scan QR code using <strong>GCash, Maya, or any PH Bank</strong>. No credit card required.
          </p>
          <div style="font-size: 11px; color: #0284c7; font-weight: 600;">
            ✓ Instant InstaPay transfer • ₱0 transaction fees
          </div>
        </div>
      </div>
      <button type="button" style="width: 100%; margin-top: 12px; background: #005ce6; color: #ffffff; border: none; padding: 10px; border-radius: 8px; font-weight: 700; font-size: 13.5px; cursor: pointer;">
        Scan GCash QR Code →
      </button>
    </div>

    <!-- OPTION 2: Credit / Debit Card (Gumroad) -->
    <div id="rpSelectCardBtn" style="border: 1px solid #cbd5e1; background: #ffffff; border-radius: 14px; padding: 16px; margin-bottom: 16px; cursor: pointer; transition: all 0.15s ease;">
      <div style="display: flex; align-items: flex-start; gap: 12px;">
        <div style="width: 42px; height: 42px; background: #f1f5f9; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #475569; font-size: 20px; flex-shrink: 0;">
          💳
        </div>
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px;">
            <strong style="font-size: 15px; color: #0f172a;">Pay with Card (Gumroad)</strong>
            <span id="rpCardPrice" style="font-size: 17px; font-weight: 800; color: #334155;">$15</span>
          </div>
          <p style="margin: 0 0 6px; font-size: 12.5px; color: #64748b; line-height: 1.35;">
            Automated checkout powered by <strong>Gumroad</strong>. Instant license key delivered to your email.
          </p>
          <div style="font-size: 11px; color: #64748b;">
            Supports Visa, Mastercard, AMEX & PayPal
          </div>
        </div>
      </div>
      <a id="rpCardCheckoutLink" href="${DEFAULT_CHECKOUT_URL}" target="_blank" rel="noopener" style="display: block; text-align: center; width: 100%; box-sizing: border-box; margin-top: 12px; background: #1e293b; color: #ffffff; text-decoration: none; padding: 10px; border-radius: 8px; font-weight: 700; font-size: 13px;">
        Continue with Card ($15) →
      </a>
    </div>

    <div style="text-align: center; padding-top: 8px; border-top: 1px solid #f1f5f9; font-size: 12.5px; color: #64748b;">
      Already have a license key? <a href="#" id="rpOpenKeyFromChoice" style="color: #2563eb; font-weight: 700; text-decoration: underline;">Enter your key here →</a>
    </div>
  `;

  // VIEW 2: GCash QR Code Details
  const gcashView = document.createElement('div');
  gcashView.id = 'rpPaymentGcashView';
  gcashView.style.display = 'none';

  gcashView.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
      <button type="button" id="rpBackToChoiceBtn" style="background: none; border: none; color: #2563eb; font-size: 13px; font-weight: 700; cursor: pointer; padding: 0; display: flex; align-items: center; gap: 4px;">
        ← Back to options
      </button>
      <span style="background: #e0f2fe; color: #0369a1; font-size: 10.5px; font-weight: 700; padding: 3px 8px; border-radius: 6px;">
        GCash / QR Ph Verified
      </span>
    </div>

    <div style="text-align: center; margin-bottom: 12px;">
      <h3 style="margin: 0 0 4px; font-size: 19px; font-weight: 800; color: #005ce6;">Scan to Pay via GCash</h3>
      <p style="margin: 0; font-size: 12.5px; color: #64748b;">
        Works with <strong>GCash</strong>, <strong>Maya</strong>, <strong>BDO</strong>, <strong>BPI</strong>, <strong>UnionBank</strong>, and all QR Ph apps.
      </p>
    </div>

    <!-- Amount Banner -->
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; text-align: center; margin-bottom: 14px;">
      <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.04em;">Amount to Send</div>
      <div id="rpGcashAmountDisplay" style="font-size: 26px; font-weight: 900; color: #005ce6; margin: 2px 0;">₱880.00</div>
      <div style="font-size: 12px; color: #475569;">
        Recipient: <strong>AD**F D.</strong> &bull; User ID: <strong>&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;A4UKL3</strong>
      </div>
    </div>

    <!-- QR Code Image -->
    <div style="text-align: center; margin-bottom: 16px;">
      <div style="display: inline-block; background: #ffffff; padding: 8px; border-radius: 16px; border: 2px solid #e2e8f0; box-shadow: 0 4px 14px rgba(0,0,0,0.08); max-width: 270px; width: 100%; box-sizing: border-box;">
        <img src="${GCASH_QR_DATA_URI}" alt="GCash QR Code" style="width: 100%; height: auto; border-radius: 10px; display: block;" />
      </div>
      <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
        💡 Tip: Screenshot or save this QR code to scan from your photo gallery!
      </div>
    </div>

    <!-- 3-Step Simple Guide -->
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; font-size: 12px; color: #166534; line-height: 1.5;">
      <strong>How to get your instant unlock key:</strong>
      <ol style="margin: 4px 0 0; padding-left: 18px;">
        <li>Open your GCash app and tap <strong>Scan QR</strong>.</li>
        <li>Scan the QR code above and send the exact amount (<span id="rpGcashStepAmount">₱880</span>).</li>
        <li>Take a screenshot of your payment receipt and message our Facebook Page. We'll send your unlock key right away!</li>
      </ol>
    </div>

    <!-- Action Buttons -->
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <a href="https://m.me/61578437432961" target="_blank" rel="noopener" id="rpMessengerBtn" style="background: #005ce6; color: #ffffff; padding: 11px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 13.5px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 6px rgba(0,92,230,0.3);">
        💬 Message Us on Facebook to Get Key →
      </a>
      <button type="button" id="rpAlreadyHaveKeyBtn" style="background: transparent; color: #475569; border: 1px solid #cbd5e1; padding: 9px; border-radius: 10px; font-weight: 600; font-size: 12.5px; cursor: pointer;">
        🔑 I Already Have My Key (Enter Key)
      </button>
    </div>
  `;

  box.appendChild(closeBtn);
  box.appendChild(choiceView);
  box.appendChild(gcashView);
  overlay.appendChild(box);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePaymentModal();
  });

  // Event handlers
  choiceView.querySelector('#rpSelectGcashBtn')?.addEventListener('click', () => {
    choiceView.style.display = 'none';
    gcashView.style.display = 'block';
  });

  choiceView.querySelector('#rpOpenKeyFromChoice')?.addEventListener('click', (e) => {
    e.preventDefault();
    closePaymentModal();
    requireLicense(() => {});
  });

  gcashView.querySelector('#rpBackToChoiceBtn')?.addEventListener('click', () => {
    gcashView.style.display = 'none';
    choiceView.style.display = 'block';
  });

  gcashView.querySelector('#rpAlreadyHaveKeyBtn')?.addEventListener('click', () => {
    closePaymentModal();
    requireLicense(() => {});
  });

  document.body.appendChild(overlay);

  paymentModalEls = { overlay, box, choiceView, gcashView };
  return paymentModalEls;
}

function openPaymentOptionsModal(isTemplateOnly) {
  const { overlay, choiceView, gcashView } = ensurePaymentModal();
  const checkoutUrl = getCheckoutUrl();

  const gPrice = document.getElementById('rpGcashPrice');
  const cPrice = document.getElementById('rpCardPrice');
  const gAmt = document.getElementById('rpGcashAmountDisplay');
  const gStepAmt = document.getElementById('rpGcashStepAmount');
  const cLink = document.getElementById('rpCardCheckoutLink');

  if (isTemplateOnly) {
    if (gPrice) gPrice.textContent = '₱590';
    if (cPrice) cPrice.textContent = '$10';
    if (gAmt) gAmt.textContent = '₱590.00';
    if (gStepAmt) gStepAmt.textContent = '₱590';
    if (cLink) cLink.textContent = 'Continue with Card ($10) →';
  } else {
    if (gPrice) gPrice.textContent = '₱880';
    if (cPrice) cPrice.textContent = '$15';
    if (gAmt) gAmt.textContent = '₱880.00';
    if (gStepAmt) gStepAmt.textContent = '₱880';
    if (cLink) cLink.textContent = 'Continue with Card ($15) →';
  }

  if (cLink) cLink.href = checkoutUrl;

  choiceView.style.display = 'block';
  gcashView.style.display = 'none';
  overlay.style.display = 'flex';
}

function closePaymentModal() {
  if (!paymentModalEls) return;
  paymentModalEls.overlay.style.display = 'none';
}

window.openPaymentOptionsModal = openPaymentOptionsModal;
window.closePaymentModal = closePaymentModal;

function ensurePreviewModal() {
  if (modalEls) return modalEls;

  const overlay = document.createElement('div');
  overlay.id = 'previewModalOverlay';
  overlay.style.cssText = `
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.6);
    z-index: 9999;
    align-items: center;
    justify-content: center;
    padding: 24px;
    flex-wrap: wrap;
    gap: 8px;
  `;

  const box = document.createElement('div');
  box.style.cssText = `
    background: white;
    border-radius: 12px;
    width: 100%;
    max-width: 1260px;
    height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    background: #ffffff;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;
    gap: 12px;
  `;

  // Left side: Brand + Status badge
  const headerLeft = document.createElement('div');
  headerLeft.style.cssText = 'display: flex; align-items: center; gap: 10px; flex-shrink: 0;';

  const brand = document.createElement('div');
  brand.style.cssText = 'font-weight: 700; font-size: 13px; color: #0f172a; display: flex; align-items: center; gap: 6px; letter-spacing: -0.01em;';
  brand.innerHTML = '<span>📄</span><span>Live Preview</span>';

  const title = document.createElement('div');
  title.id = 'previewModalStatus';
  title.style.cssText = `
    font-size: 11.5px;
    color: #4338ca;
    background: #eef2ff;
    padding: 3px 10px;
    border-radius: 999px;
    font-weight: 600;
    white-space: nowrap;
    border: 1px solid #c7d2fe;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  `;
  title.textContent = '● Ready';

  headerLeft.appendChild(brand);
  headerLeft.appendChild(title);
  header.appendChild(headerLeft);

  // Right side: View controls + Buy Key + Publish + Close
  const headerRight = document.createElement('div');
  headerRight.style.cssText = 'display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-shrink: 0; flex-wrap: wrap;';

  const viewBar = document.createElement('div');
  viewBar.style.cssText = 'display: flex; gap: 4px; margin-right: 4px; flex-shrink: 0;';
  const mkViewBtn = (id, label, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.textContent = label;
    b.style.cssText = 'border: 1px solid #d1d5db; border-radius: 999px; padding: 4px 12px; font-size: 11px; font-weight: 600; cursor: pointer; margin: 0; background: #ffffff; color: #374151; transition: all 0.15s ease;';
    b.addEventListener('click', onClick);
    return b;
  };
  viewBar.appendChild(mkViewBtn('previewDesktopBtn', 'Desktop', () => { previewDevice = 'desktop'; applyPreviewView(); }));
  viewBar.appendChild(mkViewBtn('previewMobileBtn', 'Mobile', () => { previewDevice = 'mobile'; applyPreviewView(); }));
  viewBar.appendChild(mkViewBtn('previewFullBtn', 'Full screen', () => { previewFull = !previewFull; applyPreviewView(); }));
  headerRight.appendChild(viewBar);

  // Pages opt into this by defining window.rpEditDetails (index hands off to
  // the form builder; the form builder jumps back to its own fields).
  if (typeof window.rpEditDetails === 'function') {
    const editDetailsBtn = document.createElement('button');
    editDetailsBtn.type = 'button';
    editDetailsBtn.id = 'previewHeaderEditBtn';
    editDetailsBtn.textContent = '✏️ Edit';
    editDetailsBtn.title = 'Edit your details';
    editDetailsBtn.style.cssText = `
      background: #ffffff;
      color: #3730a3;
      border: 1px solid #c7d2fe;
      padding: 5px 12px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    `;
    editDetailsBtn.addEventListener('click', () => window.rpEditDetails());
    headerRight.appendChild(editDetailsBtn);
  }

  const buyHeaderBtn = document.createElement('a');
  buyHeaderBtn.id = 'previewHeaderBuyKeyBtn';
  buyHeaderBtn.href = '#';
  buyHeaderBtn.textContent = '🔑 Buy Key ($15 / ₱880)';
  buyHeaderBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openPaymentOptionsModal();
  });
  buyHeaderBtn.title = 'Get your license key for unlimited publishing & updates';
  buyHeaderBtn.style.cssText = `
    background: #2563eb;
    color: #ffffff;
    border: 1px solid #1d4ed8;
    padding: 5px 12px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 700;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    transition: all 0.2s ease;
  `;
  headerRight.appendChild(buyHeaderBtn);

  const publishHeaderBtn = document.createElement('button');
  publishHeaderBtn.type = 'button';
  publishHeaderBtn.id = 'previewHeaderPublishBtn';
  publishHeaderBtn.textContent = '🚀 Publish';
  publishHeaderBtn.title = 'Publish your resume live online';
  publishHeaderBtn.style.cssText = `
    background: #10b981;
    color: #ffffff;
    border: 1px solid #059669;
    padding: 5px 13px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    transition: all 0.2s ease;
  `;
  publishHeaderBtn.addEventListener('click', triggerPublishFromPreview);
  headerRight.appendChild(publishHeaderBtn);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '✕ Close';
  closeBtn.style.cssText = `
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    padding: 5px 12px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 600;
    color: #475569;
    cursor: pointer;
    flex-shrink: 0;
    margin-left: 2px;
  `;
  closeBtn.addEventListener('click', closePreviewModal);
  headerRight.appendChild(closeBtn);

  header.appendChild(headerRight);

  // Dedicated Theme Toolbar Strip
  const themeBar = document.createElement('div');
  themeBar.id = 'previewThemeBar';
  themeBar.style.cssText = `
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 16px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    flex-shrink: 0;
    overflow-x: auto;
    white-space: nowrap;
  `;

  const themeLabel = document.createElement('span');
  themeLabel.textContent = 'THEME:';
  themeLabel.style.cssText = 'font-size: 11px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.05em; margin-right: 4px; flex-shrink: 0;';
  themeBar.appendChild(themeLabel);

  Object.entries(THEME_PRESETS).forEach(([id, p]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = p.name;
    btn.dataset.themeId = id;
    const isCur = id === currentThemeId;
    btn.style.cssText = `
      background: ${isCur ? '#4f46e5' : '#ffffff'};
      border: 1px solid ${isCur ? '#4338ca' : '#cbd5e1'};
      border-radius: 999px;
      padding: 3px 11px;
      font-size: 11px;
      font-weight: ${isCur ? '700' : '500'};
      color: ${isCur ? '#ffffff' : '#374151'};
      cursor: pointer;
      flex-shrink: 0;
      transition: all 0.15s ease;
    `;
    btn.addEventListener('click', () => {
      selectTheme(id, p.theme);
    });
    themeBar.appendChild(btn);
  });

  const customizeBtn = document.createElement('button');
  customizeBtn.type = 'button';
  customizeBtn.id = 'previewCustomizeBtn';
  customizeBtn.textContent = '🎨 Customize';
  customizeBtn.title = 'Customize background, text, and accent colors';
  const isCustomActive = currentThemeId === 'custom';
  customizeBtn.style.cssText = `
    background: ${isCustomActive ? '#4f46e5' : '#ffffff'};
    border: 1px solid ${isCustomActive ? '#4338ca' : '#cbd5e1'};
    border-radius: 999px;
    padding: 3px 11px;
    font-size: 11px;
    font-weight: ${isCustomActive ? '700' : '600'};
    color: ${isCustomActive ? '#ffffff' : '#374151'};
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s ease;
  `;
  customizeBtn.addEventListener('click', toggleModalCustomDrawer);
  themeBar.appendChild(customizeBtn);

  const iframeWrap = document.createElement('div');
  iframeWrap.style.cssText = 'flex: 1; overflow: auto; background: #f5f5f5;';

  const modalFooter = document.createElement('div');
  modalFooter.id = 'previewModalFooter';
  modalFooter.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 18px;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    flex-shrink: 0;
    flex-wrap: wrap;
    gap: 10px;
  `;
  modalFooter.innerHTML = `
    <div id="previewFooterStatus" style="font-size: 13px; color: #334155; line-height: 1.4;">
      ✨ <strong>Love how your resume turned out?</strong> Get your unlock key to publish online with unlimited updates.
      <div style="font-size: 11px; color: #64748b; margin-top: 4px; display: flex; align-items: center; gap: 5px;">
        <span>🔒 Secure checkout powered by <strong>Gumroad</strong> • 256-bit encrypted</span>
      </div>
    </div>
    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button type="button" id="previewFooterBuyKeyBtn" style="background: #2563eb; color: #ffffff; border: none; padding: 7px 16px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(37,99,235,0.2); transition: all 0.15s ease;">
          🔑 Buy Unlock Key ($15 / ₱880) →
        </button>
        <button type="button" id="previewFooterPublishBtn" style="background: #10b981; color: #ffffff; border: 1px solid #059669; padding: 7px 18px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(16,185,129,0.2); transition: all 0.15s ease;">
          🚀 Publish Live →
        </button>
      </div>
      <div style="font-size: 11px; color: #64748b; display: flex; align-items: center; gap: 4px;">
        <span>Supports Visa, Mastercard, AMEX & PayPal</span>
      </div>
    </div>
  `;

  const footerPubBtn = modalFooter.querySelector('#previewFooterPublishBtn');
  if (footerPubBtn) {
    footerPubBtn.addEventListener('click', triggerPublishFromPreview);
  }
  const footerBuyBtn = modalFooter.querySelector('#previewFooterBuyKeyBtn');
  if (footerBuyBtn) {
    footerBuyBtn.addEventListener('click', () => openPaymentOptionsModal());
  }

  const customDrawer = document.createElement('div');
  customDrawer.id = 'previewCustomDrawer';
  customDrawer.style.cssText = `
    display: none;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    padding: 10px 16px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 12px;
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
  `;
  customDrawer.innerHTML = `
    <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
      <span style="font-weight: 700; color: #1e293b; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">🎨 Custom Colors:</span>
      <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: #475569; font-weight: 500;">
        <span>Bg 1:</span>
        <input type="color" id="modalBg1" value="#0f172a" style="border:none; width:26px; height:26px; border-radius:4px; cursor:pointer; background:none; padding:0;">
        <span id="modalBg1Val" style="font-family:monospace; font-size:11px; color:#64748b;">#0f172a</span>
      </label>
      <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: #475569; font-weight: 500;">
        <span>Bg 2:</span>
        <input type="color" id="modalBg2" value="#1e293b" style="border:none; width:26px; height:26px; border-radius:4px; cursor:pointer; background:none; padding:0;">
        <span id="modalBg2Val" style="font-family:monospace; font-size:11px; color:#64748b;">#1e293b</span>
      </label>
      <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: #475569; font-weight: 500;">
        <span>Text:</span>
        <input type="color" id="modalText" value="#f8fafc" style="border:none; width:26px; height:26px; border-radius:4px; cursor:pointer; background:none; padding:0;">
        <span id="modalTextVal" style="font-family:monospace; font-size:11px; color:#64748b;">#f8fafc</span>
      </label>
      <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: #475569; font-weight: 500;">
        <span>Accent:</span>
        <input type="color" id="modalAccent" value="#38bdf8" style="border:none; width:26px; height:26px; border-radius:4px; cursor:pointer; background:none; padding:0;">
        <span id="modalAccentVal" style="font-family:monospace; font-size:11px; color:#64748b;">#38bdf8</span>
      </label>
    </div>
    <div style="display: flex; align-items: center; gap: 8px;">
      <button type="button" id="modalQuickLightTextBtn" style="background: white; border: 1px solid #cbd5e1; border-radius: 6px; padding: 3px 10px; font-size: 11px; cursor: pointer; font-weight: 600; color: #1e293b;">🌙 Light Text</button>
      <button type="button" id="modalQuickDarkTextBtn" style="background: white; border: 1px solid #cbd5e1; border-radius: 6px; padding: 3px 10px; font-size: 11px; cursor: pointer; font-weight: 600; color: #1e293b;">☀️ Dark Text</button>
      <button type="button" id="modalCloseCustomDrawerBtn" style="background: #e2e8f0; border: none; border-radius: 6px; padding: 3px 10px; font-size: 11px; cursor: pointer; font-weight: 600; color: #475569;">✕ Done</button>
    </div>
  `;

  const getModalThemeObj = () => {
    const bg1 = customDrawer.querySelector('#modalBg1')?.value || '#0f172a';
    const bg2 = customDrawer.querySelector('#modalBg2')?.value || '#1e293b';
    const txt = customDrawer.querySelector('#modalText')?.value || '#f8fafc';
    const ac = customDrawer.querySelector('#modalAccent')?.value || '#38bdf8';
    return {
      gradientStart: bg1,
      gradientEnd: bg2,
      textColor: txt,
      headingColor: txt,
      accentColor: ac
    };
  };

  ['modalBg1', 'modalBg2', 'modalText', 'modalAccent'].forEach(id => {
    const input = customDrawer.querySelector('#' + id);
    if (!input) return;
    const valSpan = customDrawer.querySelector('#' + id + 'Val');
    input.addEventListener('input', () => {
      if (valSpan) valSpan.textContent = input.value;
      selectTheme('custom', getModalThemeObj());
    });
  });

  customDrawer.querySelector('#modalQuickLightTextBtn')?.addEventListener('click', () => {
    const txtInput = customDrawer.querySelector('#modalText');
    if (txtInput) {
      txtInput.value = '#f8fafc';
      const valSpan = customDrawer.querySelector('#modalTextVal');
      if (valSpan) valSpan.textContent = '#f8fafc';
      selectTheme('custom', getModalThemeObj());
    }
  });

  customDrawer.querySelector('#modalQuickDarkTextBtn')?.addEventListener('click', () => {
    const txtInput = customDrawer.querySelector('#modalText');
    if (txtInput) {
      txtInput.value = '#0f172a';
      const valSpan = customDrawer.querySelector('#modalTextVal');
      if (valSpan) valSpan.textContent = '#0f172a';
      selectTheme('custom', getModalThemeObj());
    }
  });

  customDrawer.querySelector('#modalCloseCustomDrawerBtn')?.addEventListener('click', () => {
    customDrawer.style.display = 'none';
  });

  box.appendChild(header);
  box.appendChild(themeBar);
  box.appendChild(customDrawer);
  box.appendChild(iframeWrap);
  box.appendChild(modalFooter);
  overlay.appendChild(box);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePreviewModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') closePreviewModal();
  });
  window.addEventListener('resize', () => {
    if (overlay.style.display !== 'none') applyPreviewView();
  });

  document.body.appendChild(overlay);

    modalEls = { overlay, iframeWrap, title, box };
  applyPreviewView();
  return modalEls;
}

function closePreviewModal() {
  if (!modalEls) return;
  modalEls.overlay.style.display = 'none';
  modalEls.iframeWrap.innerHTML = '';
    previewDevice = 'desktop';
  previewFull = false;
  applyPreviewView();
  if (window.__lastPreviewBlobUrls) {
    window.__lastPreviewBlobUrls.forEach(u => URL.revokeObjectURL(u));
    window.__lastPreviewBlobUrls = [];
  }
  if (window.__lastPreviewMessageListener) {
    window.removeEventListener('message', window.__lastPreviewMessageListener);
    window.__lastPreviewMessageListener = null;
  }
}

// --- USER COLOUR OVERRIDES ------------------------------------------------
// The section editor lets the user pick a text/heading colour per section and
// per page-frame part. Those choices ride along in data.json under
// `ui.colors`; the same CSS is injected here so the live preview and the
// published site match what the editor showed.
function userColorsCss(data) {
  try {
    if (typeof RPUserColors === 'undefined' || !RPUserColors) return '';
    const colors = data && data.ui && data.ui.colors;
    if (!colors || RPUserColors.isEmpty(colors)) return '';
    return RPUserColors.buildCss(colors);
  } catch (err) {
    return '';
  }
}

function injectUserColors(html, data) {
  try {
    if (!html || html.includes('id="rp-user-colors"')) return html;
    const css = userColorsCss(data);
    if (!css) return html;
    const block = `<style id="rp-user-colors">\n${css}</style>\n`;
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, m => m + '\n' + block);
    return block + html;
  } catch (err) {
    return html;
  }
}

// --- USER-HIDDEN SECTIONS -------------------------------------------------
// The editor lets the user hide a whole section (ui.hiddenSections). The
// preview, the download and the published site all read that same list from
// data.json and take the section — plus the nav link that points at it — out
// of the page. Section detection mirrors the editor: the template's explicit
// map when it has one, otherwise elements whose id starts with a known prefix.
function hiddenSectionsScript(hidden, templateKey) {
  const json = JSON.stringify(hidden.map(String))
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
  const explicitMap = templateKey === 'resume/style11'
    ? [
        { selector: 'header.hero .hero-contacts', section: 'Contact' },
        { selector: 'header.hero', section: 'Basics' },
        { selector: '#aboutSection', section: 'Basics' },
        { selector: '#skillsSection', section: 'Skills' },
        { selector: '#educationSection', section: 'Education' },
        { selector: '#languagesSection', section: 'Languages' },
        { selector: '#experienceSection', section: 'Experience' },
        { selector: '#projectsSection', section: 'Projects' }
      ]
    : [];
  return `<script id="rp-hidden-sections">
(function () {
  var HIDDEN = ${json};
  var MAP = ${JSON.stringify(explicitMap)};
  var PREFIX = [['about', 'Basics'], ['hero', 'Basics'], ['header', 'Basics'], ['home', 'Basics'],
    ['contact', 'Contact'], ['skill', 'Skills'], ['languag', 'Languages'],
    ['experience', 'Experience'], ['education', 'Education'],
    ['project', 'Projects'], ['reference', 'References']];

  function sectionFromId(id) {
    var low = String(id || '').toLowerCase();
    if (!low) return null;
    for (var i = 0; i < PREFIX.length; i++) {
      if (low.indexOf(PREFIX[i][0]) === 0) return PREFIX[i][1];
    }
    return null;
  }

  function hide(el) {
    el.setAttribute('data-rp-hidden-by-user', '1');
    el.style.setProperty('display', 'none', 'important');
  }

  function apply() {
    var found = [];
    MAP.forEach(function (entry) {
      try {
        document.querySelectorAll(entry.selector).forEach(function (el) {
          found.push({ el: el, section: entry.section });
        });
      } catch (e) {}
    });
    if (!MAP.length) {
      var candidates = document.querySelectorAll('section, [id$="ection"], [class~="section-block"]');
      for (var c = 0; c < candidates.length; c++) {
        var el = candidates[c];
        var section = sectionFromId(el.id);
        if (!section) continue;
        if (el.tagName !== 'SECTION' && !el.querySelector('h1,h2,h3,h4,h5,h6')) continue;
        found.push({ el: el, section: section });
      }
    }

    var ids = [];
    found.forEach(function (entry) {
      if (HIDDEN.indexOf(entry.section) === -1) return;
      hide(entry.el);
      if (entry.el.id) ids.push(entry.el.id);
    });
    ids.forEach(function (id) {
      var safeId = String(id).replace(/["\\\\]/g, function (ch) { return '\\\\' + ch; });
      document.querySelectorAll('a[href="#' + safeId + '"]').forEach(function (a) {
        hide(a.closest('li') || a);
      });
    });
  }

  var timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(apply, 250);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule);
  } else {
    schedule();
  }
  window.addEventListener('load', schedule);
  if (document.body) {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }
})();
</script>`;
}

function injectHiddenSections(html, data, templateKey) {
  try {
    if (!html || html.includes('id="rp-hidden-sections"')) return html;
    const hidden = data && data.ui && data.ui.hiddenSections;
    if (!Array.isArray(hidden) || hidden.length === 0) return html;
    const block = hiddenSectionsScript(hidden, templateKey);
    // A function replacer: the injected script contains `$` sequences that
    // String.replace would otherwise treat as replacement patterns.
    if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, () => `${block}\n</body>`);
    return html + block;
  } catch (err) {
    return html;
  }
}

// --- LIVE PREVIEW (opens in modal) --------------------------------------

// --- AUTO-HIDE EMPTY SECTIONS HELPER ------------------------------------
const AUTO_HIDE_EMPTY_SCRIPT = `<script id="rp-auto-hide-empty">
(function() {
  // --- Hide empty sections (generic) -----------------------------------
  // A section is hidden when it has no visible content, and its nav links are hidden with it.
  // Only real section elements are checked (title wrappers never are), so a filled section's
  // heading is never hidden. Anything with an h1 (name/hero) or a hero/header/footer/nav id or class is never touched.
  var RP_SEC_SEL = 'section, [id$="ection"], [class~="section"], [class~="section-block"], [class*="sidebar-section"], [class*="main-section"], [class*="content-section"], [class~="glass-card"], [id="about"], [id="about-me"], [id="contact"], [id="skills"], [id="education"], [id="experience"], [id="languages"], [id="references"], [id="projects"], [id="awards"], [id="stats"], [id="expertise"], [id="certifications"], [id="interests"], [id="socials"]';
  var RP_NOT_SEC = /hero|header|footer|masthead|nav|profile/i;
  // Only the section's own heading is stripped. Headings inside items (e.g. a job title as h3) are content.
  var RP_STRIP_SEL = '[class*="section-title"], [class*="section-label"], [class*="section-head"], [class*="section-number"], [class*="section-rule"], [class*="section-icon"], [class*="section-tag"], [class*="sec-title"], [class*="sec-label"], [class*="sec-head"], [class*="sec-rule"], i, svg, script, style';
  var RP_MEDIA_SEL = 'img[src]:not([src=""]), iframe[src]:not([src=""]), video[src]:not([src=""]), canvas, audio[src]:not([src=""])';

  // The template's own sample photo (assets/profile.jpg) counts as empty only when the user has no photo.
  // window.__rpHasPhoto: true/false once known; undefined = unknown, so nothing is hidden.
  // Styles 6 and 18 keep their sample photo: hiding it would leave an empty decorative frame.
  // Matched on the exact id + class pair, which only those two templates use.
  var RP_KEEP_SAMPLE = [{ id: 'profileImage', cls: 'profile-pic' }, { id: 'profile-photo', cls: 'profile-img' }];
  function rpIsSamplePhoto(el) {
    if (window.__rpHasPhoto !== false) return false;
    if (!el || el.tagName !== 'IMG') return false;
    for (var k = 0; k < RP_KEEP_SAMPLE.length; k++) {
      if (el.id === RP_KEEP_SAMPLE[k].id && el.getAttribute('class') === RP_KEEP_SAMPLE[k].cls) return false;
    }
    return /(^|\\/)assets\\/profile\\.jpg$/.test(el.getAttribute('src') || '');
  }

  function rpHasContent(sec) {
    var h1 = sec.querySelector('h1');
    if (h1 && h1.textContent.trim()) return true;
    var clone = sec.cloneNode(true);
    clone.querySelectorAll(RP_STRIP_SEL).forEach(function(e) { e.remove(); });
    var firstHeading = clone.querySelector('h1, h2, h3, h4, h5, h6');
    if (firstHeading) firstHeading.remove();
    if (clone.textContent.replace(/\\s+/g, '').length > 0) return true;
    var media = clone.querySelectorAll(RP_MEDIA_SEL);
    for (var i = 0; i < media.length; i++) {
      if (!rpIsSamplePhoto(media[i])) return true;
    }
    return false;
  }

  function rpSetHidden(el, hide) {
    // A section (or nav link) the user hid on purpose is never shown again by
    // the empty-section cleanup.
    if (!hide && el.hasAttribute('data-rp-hidden-by-user')) return;
    if (hide) {
      if (!el.hasAttribute('data-rp-hidden')) el.setAttribute('data-rp-hidden', el.style.display || '');
      el.style.setProperty('display', 'none', 'important');
    } else if (el.hasAttribute('data-rp-hidden')) {
      var prev = el.getAttribute('data-rp-hidden');
      el.style.removeProperty('display');
      if (prev) el.style.display = prev;
      el.removeAttribute('data-rp-hidden');
    }
  }

  function rpNavFor(id, hide) {
    document.querySelectorAll('a[href="#' + id + '"]').forEach(function(a) {
      rpSetHidden(a.closest('li') || a, hide);
    });
  }

  function hideSamplePhotos() {
    document.querySelectorAll('img').forEach(function(img) {
      rpSetHidden(img, rpIsSamplePhoto(img));
    });
  }

  function hideEmptySections() {
    hideSamplePhotos();
    document.querySelectorAll(RP_SEC_SEL).forEach(function(sec) {
      if (sec === document.body || sec === document.documentElement) return;
      if (sec.hasAttribute('data-rp-hidden-by-user')) return;
      var tag = (sec.id || '') + ' ' + (sec.className && sec.className.baseVal === undefined ? sec.className : '');
      if (RP_NOT_SEC.test(tag)) return;
      var empty = !rpHasContent(sec);
      rpSetHidden(sec, empty);
      if (sec.id) rpNavFor(sec.id, empty);
    });
  }

  // Trendy only (marker: #profile-display). Its experience and reference cards are white in its own CSS.
  // When the text on the page is light (default Trendy look, dark themes), that makes the text unreadable,
  // so those cards get a dark background. When the text is dark (light themes), the cards are left white.
  function rpLum(color) {
    var m = (color || '').match(/rgba?\\(\\s*([\\d.]+)[ ,]+([\\d.]+)[ ,]+([\\d.]+)/);
    if (!m) return null;
    return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255;
  }
  function rpFixTrendyCards() {
    if (!document.getElementById('profile-display')) return;
    document.querySelectorAll('.experience-item, .reference-item').forEach(function(card) {
      var textEl = card.querySelector('h3, p, li') || card;
      var lum = rpLum(getComputedStyle(textEl).color);
      if (lum !== null && lum > 0.6) {
        card.style.setProperty('background', 'rgba(255, 255, 255, 0.06)', 'important');
        card.style.setProperty('border-color', 'rgba(255, 255, 255, 0.12)', 'important');
      } else {
        card.style.removeProperty('background');
        card.style.removeProperty('border-color');
      }
    });
  }

  function runCleanups() {
    try { hideEmptySections(); } catch (e) {}
    try { rpFixTrendyCards(); } catch (e) {}
  }
  var rpCleanupTimer = null;
  function scheduleCleanups() {
    clearTimeout(rpCleanupTimer);
    rpCleanupTimer = setTimeout(runCleanups, 250);
  }
  window.__rpRunCleanups = runCleanups;
  window.addEventListener('load', scheduleCleanups);
  if (document.body) {
    new MutationObserver(scheduleCleanups).observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // Where the photo flag comes from:
  // - Live preview (inside the builder's iframe): the builder sends _hasPhoto with the preview data.
  // - Published or downloaded site (top-level page): data.json keeps any uploaded photo as a data: URI.
  // If neither is available, the flag stays undefined and the sample photo is left alone.
  window.addEventListener('message', function(event) {
    var d = event.data && event.data.__previewData;
    if (d && typeof d._hasPhoto === 'boolean') {
      window.__rpHasPhoto = d._hasPhoto;
      scheduleCleanups();
    }
    // A theme change restyles the page, so re-check the Trendy cards after the theme has been applied.
    if (event.data && event.data.__previewTheme !== undefined) scheduleCleanups();
    if (d && d.theme) scheduleCleanups();
  });
  if (window.parent === window && typeof fetch === 'function') {
    fetch('data.json', { cache: 'no-store' }).then(function(r) {
      return r.ok ? r.text() : null;
    }).then(function(t) {
      if (t !== null && typeof window.__rpHasPhoto === 'undefined') {
        window.__rpHasPhoto = t.indexOf('data:image/') !== -1;
        scheduleCleanups();
      }
    }).catch(function() {});
  }

  function injectGoogleSchema(data) {
    if (!data || typeof data !== 'object') return;
    try {
      var name = data.name 
        || data.header 
        || (data.personal && data.personal.name) 
        || (data.personalInfo && data.personalInfo.name)
        || (data.hero && data.hero.name)
        || (data.basics && data.basics.name)
        || (data.htmlTitle ? data.htmlTitle.split(/[—–|-]/)[0].trim() : '')
        || '';

      var title = data.title 
        || data.role 
        || data.tagline 
        || data.jobTitle 
        || (data.personal && data.personal.title) 
        || (data.personalInfo && data.personalInfo.title)
        || (data.basics && data.basics.label)
        || (data.experience && data.experience[0] && data.experience[0].position)
        || '';

      if (!title && data.htmlTitle && data.htmlTitle.indexOf('—') !== -1) {
        title = data.htmlTitle.split('—')[1].trim();
      }

      var bio = data.about 
        || data.summary 
        || data.bio 
        || (data.personal && data.personal.summary) 
        || (data.basics && data.basics.summary)
        || '';

      var skills = [];
      if (Array.isArray(data.skills)) {
        data.skills.forEach(function(s) {
          if (typeof s === 'string') skills.push(s);
          else if (s && typeof s === 'object') skills.push(s.name || s.skill || s.title || '');
        });
      }
      skills = skills.filter(Boolean).slice(0, 15);

      var sameAs = [];
      var socials = data.social || data.links || (data.personal && data.personal.social);
      if (Array.isArray(socials)) {
        socials.forEach(function(u) {
          var url = typeof u === 'string' ? u : (u.url || u.link || '');
          if (url && (url.indexOf('linkedin.com') !== -1 || url.indexOf('github.com') !== -1 || url.indexOf('twitter.com') !== -1)) {
            sameAs.push(url);
          }
        });
      }

      if (bio) {
        var metaDesc = document.querySelector('meta[name="description"]');
        if (!metaDesc) {
          metaDesc = document.createElement('meta');
          metaDesc.name = 'description';
          document.head.appendChild(metaDesc);
        }
        metaDesc.content = bio.slice(0, 160);
      }

      if (name) {
        var ogTitle = document.querySelector('meta[property="og:title"]');
        if (!ogTitle) {
          ogTitle = document.createElement('meta');
          ogTitle.setAttribute('property', 'og:title');
          document.head.appendChild(ogTitle);
        }
        ogTitle.content = name + (title ? ' — ' + title : ' — Interactive Resume');
      }

      var metaRobots = document.querySelector('meta[name="robots"]');
      if (!metaRobots) {
        metaRobots = document.createElement('meta');
        metaRobots.name = 'robots';
        metaRobots.content = 'index, follow';
        document.head.appendChild(metaRobots);
      }

      if (name) {
        var schemaEl = document.getElementById('rp-google-schema');
        if (!schemaEl) {
          schemaEl = document.createElement('script');
          schemaEl.type = 'application/ld+json';
          schemaEl.id = 'rp-google-schema';
          document.head.appendChild(schemaEl);
        }
        var schemaData = {
          "@context": "https://schema.org",
          "@type": "Person",
          "name": name,
          "jobTitle": title || undefined,
          "description": bio ? bio.slice(0, 250) : undefined,
          "url": (window.location.href || '').split('?')[0],
          "knowsAbout": skills.length ? skills : undefined,
          "sameAs": sameAs.length ? sameAs : undefined
        };
        schemaEl.textContent = JSON.stringify(schemaData, null, 2);
      }
    } catch(e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(runCleanups, 100);
      setTimeout(runCleanups, 400);
    });
  } else {
    setTimeout(runCleanups, 100);
    setTimeout(runCleanups, 400);
  }
  window.addEventListener('load', function() {
    setTimeout(runCleanups, 200);
    setTimeout(runCleanups, 800);
  });
})();
</script>`;

async function renderPreview(dataObj) {
  currentPreviewData = dataObj;
  const key = templateKey();
  const manifests = await getManifests();
  const { overlay, iframeWrap, title } = ensurePreviewModal();

  const currentCheckoutUrl = getCheckoutUrl();
  const hBtn = document.getElementById('previewHeaderBuyKeyBtn');
  if (hBtn) hBtn.href = currentCheckoutUrl;
  const fBtn = document.getElementById('previewFooterBuyKeyBtn');
  if (fBtn) fBtn.href = currentCheckoutUrl;

  const fPubBtn = document.getElementById('previewFooterPublishBtn');
  const hPubBtn = document.getElementById('previewHeaderPublishBtn');
  const curPubId = getPublishedResumeId(key);
  if (curPubId) {
    if (fPubBtn) fPubBtn.textContent = '🔄 Update Live Site';
    if (hPubBtn) hPubBtn.textContent = '🔄 Update';
  } else {
    if (fPubBtn) fPubBtn.textContent = '🚀 Publish Live →';
    if (hPubBtn) hPubBtn.textContent = '🚀 Publish';
  }

  const externalStatus = document.getElementById('previewStatus');

  if (!manifests[key]) {
    const msg = `No bundled template files yet for "${key}" — only JSON output is available for this style.`;
    if (externalStatus) externalStatus.textContent = msg;
    return;
  }

  overlay.style.display = 'flex';
  title.textContent = 'Loading preview...';
  iframeWrap.innerHTML = '';
  if (externalStatus) externalStatus.textContent = '';

  // Photo is stripped out and sent as a separate, later postMessage — see
  // the injected script below for why (avoids a large base64 string
  // travelling through the fetch/Response/JSON chain on first paint).
  let photoDataUri = '';
  let photoFieldPath = null;
  const dataForIframe = JSON.parse(JSON.stringify(dataObj));
  if (currentThemeData && !dataForIframe.theme) {
    dataForIframe.theme = currentThemeData;
  }

  function extractPhoto(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${k}` : k;
      if (typeof value === 'string' && value.startsWith('data:image')) {
        photoDataUri = value;
        photoFieldPath = currentPath;
        obj[k] = 'assets/profile.jpg';
        return;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        extractPhoto(value, currentPath);
        if (photoDataUri) return;
      }
    }
  }
  extractPhoto(dataForIframe, '');
  dataForIframe._hasPhoto = !!photoDataUri;

  // Normalize common top-level fields so switching templates without re-generating renders seamlessly
  const rawCandidateName = dataForIframe.name 
    || dataForIframe.header 
    || (dataForIframe.personal && dataForIframe.personal.name) 
    || (dataForIframe.personalInfo && dataForIframe.personalInfo.name)
    || (dataForIframe.hero && dataForIframe.hero.name)
    || (dataForIframe.basics && dataForIframe.basics.name)
    || '';
  if (rawCandidateName) {
    if (!dataForIframe.name) dataForIframe.name = rawCandidateName;
    if (!dataForIframe.header) dataForIframe.header = rawCandidateName;
    if (!dataForIframe.personal) dataForIframe.personal = { name: rawCandidateName };
    else if (!dataForIframe.personal.name) dataForIframe.personal.name = rawCandidateName;
    if (!dataForIframe.personalInfo) dataForIframe.personalInfo = { name: rawCandidateName };
    else if (!dataForIframe.personalInfo.name) dataForIframe.personalInfo.name = rawCandidateName;
  }
  const rawCandidateTitle = dataForIframe.title || dataForIframe.jobTitle || (dataForIframe.personalInfo && dataForIframe.personalInfo.title) || '';
  if (rawCandidateTitle) {
    if (!dataForIframe.title) dataForIframe.title = rawCandidateTitle;
    if (!dataForIframe.jobTitle) dataForIframe.jobTitle = rawCandidateTitle;
  }

  // Normalize project and reference schemas so field name differences (e.g. title vs name) never lose data
  if (Array.isArray(dataForIframe.projects)) {
    dataForIframe.projects.forEach(p => {
      if (p && typeof p === 'object') {
        if (!p.name && p.title) p.name = p.title;
        if (!p.title && p.name) p.title = p.name;
        if (!p.liveUrl && (p.link || p.url)) p.liveUrl = p.link || p.url;
      }
    });
  }
  if (Array.isArray(dataForIframe.references)) {
    dataForIframe.references.forEach(r => {
      if (r && typeof r === 'object') {
        if (!r.role && (r.relationship || r.title)) r.role = r.relationship || r.title;
      }
    });
  }

  const indexUrl = `${TEMPLATES_BASE}/${key}/index.html`;
  const htmlRes = await fetch(indexUrl);
  let html = await htmlRes.text();
  html = injectUserColors(html, dataForIframe);
  html = injectHiddenSections(html, dataForIframe, key);
  if (!html.includes('id="rp-auto-hide-empty"')) {
    html = html.replace(/<\/body>/i, () => `${AUTO_HIDE_EMPTY_SCRIPT}\n</body>`);
  }

  if (window.__lastPreviewBlobUrls) {
    window.__lastPreviewBlobUrls.forEach(u => URL.revokeObjectURL(u));
  }
  window.__lastPreviewBlobUrls = [];

  if (window.__lastPreviewMessageListener) {
    window.removeEventListener('message', window.__lastPreviewMessageListener);
  }

  const absoluteTemplateBase = new URL(`${TEMPLATES_BASE}/${key}/`, window.location.href).href;

  const injection = `
    <base href="${absoluteTemplateBase}">
    <style>
      img[src^="data:image"] {
        max-width: 100% !important;
        max-height: 400px !important;
        object-fit: cover !important;
      }
    </style>
    <script>
      (function() {
        var RealIntersectionObserver = window.IntersectionObserver;
        window.IntersectionObserver = function(callback, options) {
          var realObserver = new RealIntersectionObserver(callback, options);
          var patchedObserve = realObserver.observe.bind(realObserver);
          realObserver.observe = function(target) {
            patchedObserve(target);
            setTimeout(function() {
              callback([{ target: target, isIntersecting: true, intersectionRatio: 1 }], realObserver);
            }, 0);
          };
          return realObserver;
        };

        var resolveData;
        var dataPromise = new Promise(function(resolve) { resolveData = resolve; });

        // Themes paint only the page frame: header/nav, hero and footer keep
        // their layout and typography, only their background is recoloured.
        var RP_FRAME_SEL = 'header, .header, .masthead, .resume-header, .site-header, .navbar, .top-nav, .main-nav, .topbar, #navbar, #main-nav, .nav-menu, .mobile-nav, .mobile-menu, .mobile-dropdown, .mobile-drawer, .hero, .hero-section, #hero, #profile-display, section#about, footer, .footer, .resume-footer, .site-footer, #main-footer';

        function rpIsDarkHex(hex) {
          if (!hex || hex.charAt(0) !== '#') return false;
          var c = hex.substring(1);
          if (c.length === 3) c = c.split('').map(function(x){ return x + x; }).join('');
          if (c.length !== 6) return false;
          var r = parseInt(c.substring(0, 2), 16) / 255;
          var g = parseInt(c.substring(2, 4), 16) / 255;
          var b = parseInt(c.substring(4, 6), 16) / 255;
          return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 0.55;
        }

        function rpFrameTheme(theme) {
          var MARK = 'data-rp-frame-themed';
          var marked = document.querySelectorAll('[' + MARK + ']');
          for (var i = 0; i < marked.length; i++) {
            marked[i].removeAttribute(MARK);
            marked[i].style.removeProperty('background');
            marked[i].style.removeProperty('background-color');
            marked[i].style.removeProperty('background-image');
          }
          var styleEl = document.getElementById('rpFrameThemeStyle');
          if (styleEl) styleEl.parentNode.removeChild(styleEl);
          if (!theme || !theme.gradientStart) return;

          var g1 = theme.gradientStart;
          var g2 = theme.gradientEnd || g1;
          var dark = rpIsDarkHex(g1);
          var tc = theme.textColor || (dark ? '#f1f5f9' : '#1e293b');
          var hc = theme.headingColor || (dark ? '#ffffff' : '#0f172a');

          var found = document.querySelectorAll(RP_FRAME_SEL);
          var picked = [];
          for (var j = 0; j < found.length; j++) {
            var nested = false;
            for (var k = 0; k < picked.length; k++) {
              if (picked[k] !== found[j] && picked[k].contains(found[j])) { nested = true; break; }
            }
            if (!nested) picked.push(found[j]);
          }
          for (var m = 0; m < picked.length; m++) {
            picked[m].setAttribute(MARK, '1');
            picked[m].style.setProperty('background', 'linear-gradient(135deg, ' + g1 + ' 0%, ' + g2 + ' 100%)', 'important');
          }

          styleEl = document.createElement('style');
          styleEl.id = 'rpFrameThemeStyle';
          styleEl.textContent =
            '[' + MARK + '] { color: ' + tc + ' !important; }' +
            '[' + MARK + '] h1, [' + MARK + '] h2, [' + MARK + '] h3, [' + MARK + '] h4, [' + MARK + '] h5, [' + MARK + '] h6 { color: ' + hc + ' !important; }' +
            '[' + MARK + '] p, [' + MARK + '] span, [' + MARK + '] li, [' + MARK + '] a, [' + MARK + '] strong, [' + MARK + '] em, [' + MARK + '] small, [' + MARK + '] blockquote, [' + MARK + '] figcaption, [' + MARK + '] time { color: ' + tc + ' !important; }';
          document.head.appendChild(styleEl);
        }

        function applyCustomTheme(t) {
          if (typeof window.applyTheme === 'function') {
            try { window.applyTheme(t || null); return; } catch (e) {}
          }
          rpFrameTheme(t || null);
        }

        window.addEventListener('message', function(event) {
          if (!event.data) return;
          if (event.data.__previewTheme !== undefined) {
            applyCustomTheme(event.data.__previewTheme);
          }
          if (event.data.__previewData) {
            if (event.data.__previewData.theme) {
              applyCustomTheme(event.data.__previewData.theme);
            }
            resolveData(event.data.__previewData);
            setTimeout(function() {
              if (typeof window.__rpRunCleanups === 'function') window.__rpRunCleanups();
            }, 60);
            setTimeout(function() {
              if (typeof window.__rpRunCleanups === 'function') window.__rpRunCleanups();
            }, 300);
          }
          if (event.data.__previewPhoto) {
            var photoSrc = event.data.__previewPhoto.src;
            document.querySelectorAll('img').forEach(function(img) {
              if (
                img.getAttribute('src') === 'assets/profile.jpg' ||
                img.src.indexOf('assets/profile.jpg') !== -1
              ) {
                img.src = photoSrc;
              }
            });
          }
        });

        var realFetch = window.fetch;
        window.fetch = function(input, init) {
          var url = typeof input === 'string' ? input : (input && input.url) || '';
          if (url.indexOf('data.json') !== -1) {
            return dataPromise.then(function(data) {
              return new Response(JSON.stringify(data), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            });
          }
          return realFetch.apply(this, arguments);
        };

        // The injected <base> makes fragment links resolve to the real template
        // folder, which would replace this preview with the template's sample
        // data. Keep in-page anchors scrolling here and block navigation to
        // template pages such as form.html.
        function showPreviewLinkNote() {
          var note = document.getElementById('rpPreviewLinkNote');
          if (!note) {
            note = document.createElement('div');
            note.id = 'rpPreviewLinkNote';
            note.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
              'background:rgba(17,24,39,0.92);color:#fff;padding:10px 16px;border-radius:8px;' +
              'font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;z-index:2147483647;' +
              'pointer-events:none;opacity:0;transition:opacity .18s ease;max-width:90%;text-align:center;';
            document.body.appendChild(note);
          }
          note.textContent = 'This is a preview. Page links work in your downloaded or published resume.';
          note.style.opacity = '1';
          clearTimeout(note.__rpTimer);
          note.__rpTimer = setTimeout(function() { note.style.opacity = '0'; }, 2400);
        }

        document.addEventListener('click', function(event) {
          var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
          if (!link) return;
          var href = (link.getAttribute('href') || '').trim();
          if (!href) return;

          if (href.charAt(0) === '#') {
            event.preventDefault();
            var id = href.slice(1);
            var target = null;
            if (id) {
              try { id = decodeURIComponent(id); } catch (err) {}
              target = document.getElementById(id) || document.getElementsByName(id)[0];
            }
            if (target) {
              target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else if (!id || id === 'top') {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
              showPreviewLinkNote();
            }
            try { history.replaceState(null, '', href); } catch (err) {}
            return;
          }

          if (/^(mailto:|tel:)/i.test(href)) return;

          if (/^https?:/i.test(href) || href.indexOf('//') === 0) {
            // Keep the preview in place; open external links in a new tab.
            if (link.target !== '_blank') {
              link.setAttribute('target', '_blank');
              link.setAttribute('rel', 'noopener noreferrer');
            }
            return;
          }

          // Any other relative link (form.html, index.html, assets/...) would
          // navigate the iframe away from the preview.
          event.preventDefault();
          showPreviewLinkNote();
        }, true);

        window.addEventListener('error', function(e) {
          window.parent.postMessage({
            __previewError: (e.error && e.error.stack) || e.message || 'Unknown error in preview'
          }, '*');
        });
        window.addEventListener('unhandledrejection', function(e) {
          window.parent.postMessage({
            __previewError: 'Unhandled promise rejection: ' + (e.reason && (e.reason.stack || e.reason.message || e.reason))
          }, '*');
        });

        dataPromise.then(function() {
          window.parent.postMessage({ __previewDataReceived: true }, '*');
        });
      })();
    </script>
  `;

  html = html.replace(/<head>/i, () => `<head>${injection}`);

  const htmlBlob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const htmlBlobUrl = URL.createObjectURL(htmlBlob);
  window.__lastPreviewBlobUrls.push(htmlBlobUrl);

  const iframe = document.createElement('iframe');
  iframe.id = 'previewModalIframe';
  // Fixed, generous pixel dimensions rather than percentage — the modal
  // itself already provides the room; this avoids relying on percentage
  // sizing resolving correctly on first paint inside a freshly-inserted,
  // dynamically-created container.
  iframe.style.cssText = 'width: 100%; height: 100%; border: none; display: block;';
  iframe.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms allow-downloads');

  let receivedConfirmation = false;
  const messageListener = (event) => {
    if (!event.data) return;

    if (event.data.__previewError) {
      title.textContent = 'Preview error (inside template): ' + event.data.__previewError;
      title.style.color = '#dc2626';
    } else if (event.data.__previewDataReceived) {
      receivedConfirmation = true;
      title.textContent = 'Preview ready.';
      title.style.color = '#6b7280';

      if (photoDataUri) {
        setTimeout(() => {
          iframe.contentWindow.postMessage({
            __previewPhoto: { src: photoDataUri, field: photoFieldPath }
          }, '*');
        }, 300);
      }
    }
  };
  window.addEventListener('message', messageListener);
  window.__lastPreviewMessageListener = messageListener;

  iframe.addEventListener('load', () => {
    iframe.contentWindow.postMessage({ __previewData: dataForIframe }, '*');
    setTimeout(() => {
      if (!receivedConfirmation) {
        title.textContent = 'Preview loaded, but the template never requested the data — it may use a different loading method than expected.';
      }
    }, 4000);
  });

  iframe.src = htmlBlobUrl;
  iframeWrap.appendChild(iframe);
  // The iframe only exists now, so re-apply the current device mode to it.
  applyPreviewView();
}

// --- SHARED: fetch manifest files once, used by both zip download and publish ---
async function fetchTemplateFiles(key) {
  const manifests = await getManifests();
  if (!manifests[key]) return null;

  const result = {};
  await Promise.all(manifests[key].map(async (relPath) => {
    const url = `${TEMPLATES_BASE}/${key}/${relPath}`;
    const res = await fetch(url);
    if (relPath.match(/\.(jpg|jpeg|png|gif|webp|ico)$/i)) {
      const blob = await res.blob();
      result[relPath] = { content: await blobToBase64(blob), encoding: 'base64' };
    } else {
      let text = await res.text();
      if (relPath === 'index.html' && !text.includes('id="rp-auto-hide-empty"')) {
        text = text.replace(/<\/body>/i, () => `${AUTO_HIDE_EMPTY_SCRIPT}\n</body>`);
      }
      result[relPath] = { content: text, encoding: 'utf-8' };
    }
  }));
  return result;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]); // strip data: prefix
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}


// --- SEO & GOOGLE STRUCTURED DATA INJECTOR (schema.org/Person) ---
function injectSeoHeadTags(html, data) {
  if (!html || !data) return html;
  try {
    const name = data.name 
      || data.header 
      || (data.personal && data.personal.name) 
      || (data.personalInfo && data.personalInfo.name)
      || (data.hero && data.hero.name)
      || (data.basics && data.basics.name)
      || (data.htmlTitle ? data.htmlTitle.split(/[—–|-]/)[0].trim() : '')
      || '';

    const title = data.title 
      || data.role 
      || data.tagline 
      || data.jobTitle 
      || (data.personal && data.personal.title) 
      || (data.personalInfo && data.personalInfo.title)
      || (data.basics && data.basics.label)
      || (data.experience && data.experience[0] && data.experience[0].position)
      || '';

    const bio = data.about 
      || data.summary 
      || data.bio 
      || (data.personal && data.personal.summary) 
      || (data.basics && data.basics.summary)
      || '';

    const skills = [];
    if (Array.isArray(data.skills)) {
      data.skills.forEach(s => {
        if (typeof s === 'string') skills.push(s);
        else if (s && typeof s === 'object') skills.push(s.name || s.skill || s.title || '');
      });
    }
    const cleanSkills = skills.filter(Boolean).slice(0, 15);

    const safeName = (name || 'Professional').replace(/"/g, '&quot;');
    const safeTitle = (title || 'Interactive Resume').replace(/"/g, '&quot;');
    const safeBio = (bio || `${safeName} interactive web resume and portfolio.`).slice(0, 160).replace(/"/g, '&quot;');

    const schemaObj = {
      "@context": "https://schema.org",
      "@type": "Person",
      "name": name || safeName,
      ...(title ? { "jobTitle": title } : {}),
      ...(bio ? { "description": bio.slice(0, 250).replace(/\n/g, ' ') } : {}),
      ...(cleanSkills.length ? { "knowsAbout": cleanSkills } : {})
    };

    const seoBlock = `
  <!-- Google Search & Social Optimization (schema.org/Person) -->
  <meta name="robots" content="index, follow" />
  <meta name="description" content="${safeBio}" />
  <meta property="og:title" content="${safeName} — ${safeTitle}" />
  <meta property="og:description" content="${safeBio}" />
  <meta property="og:type" content="profile" />
  <script type="application/ld+json" id="rp-google-schema">
${JSON.stringify(schemaObj, null, 2)}
  </script>`;

    if (!html.includes('id="rp-google-schema"') && html.includes('</head>')) {
      return html.replace(/<\/head>/i, () => `${seoBlock}\n</head>`);
    }
  } catch(e) {
    console.warn('SEO injection warning:', e);
  }
  return html;
}

// --- FULL SITE DOWNLOAD (.zip) -----------------------------------------

async function downloadFullSite(dataObj) {
  const key = templateKey();
  const files = await fetchTemplateFiles(key);

  if (!files) {
    alert(`No bundled template files yet for "${key}". This style only supports JSON download right now.`);
    return;
  }

  const downloadStatus = document.getElementById('previewStatus');
  if (downloadStatus) downloadStatus.textContent = 'Packaging your site...';

  if (currentThemeData && !dataObj.theme) {
    dataObj.theme = currentThemeData;
  }
  if (files['index.html']) {
    files['index.html'].content = injectUserColors(files['index.html'].content, dataObj);
    files['index.html'].content = injectHiddenSections(files['index.html'].content, dataObj, key);
    files['index.html'].content = injectSeoHeadTags(files['index.html'].content, dataObj);
  }
  const zip = new JSZip();
  for (const [relPath, file] of Object.entries(files)) {
    zip.file(relPath, file.content, file.encoding === 'base64' ? { base64: true } : undefined);
  }
  zip.file('data.json', JSON.stringify(dataObj, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${key.replace('/', '-')}-site.zip`;
  a.click();
  URL.revokeObjectURL(url);

  if (downloadStatus) downloadStatus.textContent = 'Downloaded — unzip and open index.html, or host the folder anywhere.';
}

// --- PUBLISH (push to GitHub branch → auto-deploys via connected Cloudflare Pages project) ---

function getPublishedResumeId(tplKey) {
  const k = (tplKey || templateKey()).replace(/[^a-zA-Z0-9_-]/g, '_');
  const perTemplate = localStorage.getItem(`publishedResumeId_${k}`);
  if (perTemplate) return perTemplate;

  const legacyId = localStorage.getItem('publishedResumeId');
  const legacyTpl = localStorage.getItem('publishedResumeTemplate');
  if (legacyId && (!legacyTpl || legacyTpl === k)) {
    return legacyId;
  }
  return null;
}

function setPublishedResumeId(tplKey, id) {
  const k = (tplKey || templateKey()).replace(/[^a-zA-Z0-9_-]/g, '_');
  if (id) {
    localStorage.setItem(`publishedResumeId_${k}`, id);
    localStorage.setItem('publishedResumeTemplate', k);
    localStorage.setItem('publishedResumeId', id);
  } else {
    localStorage.removeItem(`publishedResumeId_${k}`);
  }
}

let currentPreviewData = null;

async function publishSite(dataObj) {
  const key = templateKey();
  const publishStatus = document.getElementById('publishStatus');
  const publishResult = document.getElementById('publishResult');
  const publishBtn = document.getElementById('publishBtn');

  // Preview modal UI hooks
  const previewFooterPublishBtn = document.getElementById('previewFooterPublishBtn');
  const previewHeaderPublishBtn = document.getElementById('previewHeaderPublishBtn');
  const previewFooterStatus = document.getElementById('previewFooterStatus');

  let currentPublishedId = getPublishedResumeId(key);

  const files = await fetchTemplateFiles(key);
  if (!files) {
    const errMsg = `No bundled template files yet for "${key}" — publishing isn't available for this style.`;
    if (publishStatus) { publishStatus.textContent = errMsg; publishStatus.className = 'status error'; }
    if (previewFooterStatus) { previewFooterStatus.innerHTML = `<span style="color:#dc2626; font-weight:600;">❌ ${errMsg}</span>`; }
    return;
  }

  if (publishBtn) publishBtn.disabled = true;
  if (previewFooterPublishBtn) { previewFooterPublishBtn.disabled = true; previewFooterPublishBtn.textContent = '⏳ Publishing…'; }
  if (previewHeaderPublishBtn) { previewHeaderPublishBtn.disabled = true; previewHeaderPublishBtn.textContent = '⏳ Publishing…'; }

  const statusText = currentPublishedId ? 'Updating your live resume…' : 'Publishing your resume online…';
  if (publishStatus) { publishStatus.textContent = statusText; publishStatus.className = 'status'; }
  if (previewFooterStatus) {
    previewFooterStatus.innerHTML = `<span style="color:#2563eb; font-weight:600;">⏳ ${statusText}</span>`;
  }
  if (publishResult) publishResult.innerHTML = '';

  if (currentThemeData) {
    dataObj.theme = currentThemeData;
  }
  if (files['index.html']) {
    files['index.html'].content = injectUserColors(files['index.html'].content, dataObj);
    files['index.html'].content = injectHiddenSections(files['index.html'].content, dataObj, key);
    files['index.html'].content = injectSeoHeadTags(files['index.html'].content, dataObj);
  }
  const payload = { ...files, 'data.json': { content: JSON.stringify(dataObj, null, 2), encoding: 'utf-8' } };

  const rawName = dataObj.name 
    || dataObj.header 
    || (dataObj.personal && dataObj.personal.name) 
    || (dataObj.personalInfo && dataObj.personalInfo.name)
    || (dataObj.hero && dataObj.hero.name)
    || (dataObj.basics && dataObj.basics.name)
    || (dataObj.htmlTitle ? dataObj.htmlTitle.split(/[—–|-]/)[0].trim() : '')
    || '';

  const nameSlug = rawName
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);

  try {
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(nameSlug ? { 'X-Resume-Slug': nameSlug } : {}),
        ...(currentPublishedId ? { 'X-Resume-Id': currentPublishedId } : {}),
      },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Publish failed');

    currentPublishedId = result.resume_id;
    setPublishedResumeId(key, currentPublishedId);

    if (publishStatus) { publishStatus.textContent = 'Live!'; publishStatus.className = 'status success'; }
    if (publishResult) {
      publishResult.innerHTML = `<a href="${result.url}" target="_blank" rel="noopener" class="cta-link">View your live resume →</a> <button type="button" class="secondary" id="copyLinkBtn">Copy link</button>`;
      document.getElementById('copyLinkBtn')?.addEventListener('click', () => navigator.clipboard.writeText(result.url));
    }
    if (publishBtn) publishBtn.textContent = 'Update published site →';

    // Update preview modal status and action buttons
    if (previewFooterStatus) {
      previewFooterStatus.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="color:#059669; font-weight:700;">🎉 Resume is Live!</span>
          <a href="${result.url}" target="_blank" rel="noopener" style="color:#2563eb; font-weight:700; text-decoration:underline;">View live resume →</a>
          <button type="button" id="previewCopyLinkBtn" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; padding:3px 10px; font-size:12px; font-weight:600; cursor:pointer; color:#334155;">📋 Copy link</button>
        </div>
      `;
      const copyBtn = document.getElementById('previewCopyLinkBtn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(result.url);
          copyBtn.textContent = '✓ Copied!';
          setTimeout(() => { copyBtn.textContent = '📋 Copy link'; }, 2500);
        });
      }
    }
    if (previewFooterPublishBtn) previewFooterPublishBtn.textContent = '🔄 Update Live Site';
    if (previewHeaderPublishBtn) previewHeaderPublishBtn.textContent = '🔄 Update';

  } catch (err) {
    if (publishStatus) { publishStatus.textContent = 'Error: ' + err.message; publishStatus.className = 'status error'; }
    if (previewFooterStatus) {
      previewFooterStatus.innerHTML = `<span style="color:#dc2626; font-weight:600;">❌ Publish error: ${err.message}</span>`;
    }
    if (previewFooterPublishBtn) previewFooterPublishBtn.textContent = currentPublishedId ? '🔄 Update Live Site' : '🚀 Publish Live →';
    if (previewHeaderPublishBtn) previewHeaderPublishBtn.textContent = currentPublishedId ? '🔄 Update' : '🚀 Publish';
  } finally {
    if (publishBtn) publishBtn.disabled = false;
    if (previewFooterPublishBtn) previewFooterPublishBtn.disabled = false;
    if (previewHeaderPublishBtn) previewHeaderPublishBtn.disabled = false;
  }
}

// --- LICENSE GATE -------------------------------------------------------
// Gates downloads and publishing (not preview) behind a valid Gumroad
// license key. Two paths to unlock:
//   1. Automatic — Gumroad's post-purchase redirect appends ?license_key=...
//      to the URL. Detected and verified silently on page load.
//   2. Manual fallback — a small modal with an input field, for anyone
//      returning later without that URL (using the key from their Gumroad
//      receipt email instead).
// Once verified, unlocked for the rest of the page visit — no re-prompting
// per download.

window.__licenseVerified = false;
window.__licenseVerifiedTemplate = null; // which template the current __licenseVerified=true actually covers
window.__licenseEmail = null;

// Each gated style has its OWN Gumroad product, so it needs its own checkout
// link too -- mirrors PRODUCT_ID_ENV_BY_TEMPLATE on the backend. Add a line
// here every time a new style gets its own product.
// Checkout URLs hoisted to top of file


// NOTE: requireLicense() below checks window.__licenseVerifiedTemplate
// against the currently selected template before skipping re-verification.
// This still matters with one-Gumroad-product-per-template, because it's
// what triggers a fresh /api/verify-license call (and therefore a fresh
// check against the correct per-template product) whenever someone switches
// templates mid-session -- without it, a session that unlocked "modern"
// would never re-ask the server after switching to "classic".
async function verifyLicenseKey(key) {
  try {
    const currentTemplate = templateKey();
    const res = await fetch('/api/verify-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: key, templateKey: currentTemplate })
    });
    const result = await res.json();
    if (result.valid) {
      window.__licenseVerified = true;
      window.__licenseVerifiedTemplate = currentTemplate;
      window.__licenseEmail = result.email || null;
    }
    // surface server-side errors distinctly instead of masking them as "invalid key"
    if (result.error && !result.reason) {
      result.reason = `Server error: ${result.error}`;
    }
    return result;
  } catch (err) {
    return { valid: false, reason: 'Could not reach the verification server. Check your connection and try again.' };
  }
}

let licenseModalEls = null;
let pendingAfterVerify = null;

function ensureLicenseModal() {
  if (licenseModalEls) return licenseModalEls;

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    display: none; position: fixed; inset: 0; background: rgba(15,23,42,0.6);
    z-index: 10000; align-items: center; justify-content: center; padding: 24px;
  `;

  const box = document.createElement('div');
  box.style.cssText = `
    background: var(--card, white); border-radius: 14px; width: 100%; max-width: 420px;
    padding: 28px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); font-family: var(--font-body, inherit);
  `;

  const heading = document.createElement('div');
  heading.style.cssText = 'font-family: var(--font-display, inherit); font-size: 18px; font-weight: 700; color: var(--ink, #1B2333); margin-bottom: 6px;';
  heading.textContent = 'Unlock publishing & downloads';

  const sub = document.createElement('div');
  sub.style.cssText = 'font-size: 13px; color: var(--ink-soft, #6b7280); margin-bottom: 16px; line-height: 1.5;';
  sub.innerHTML = 'Enter the license key from your purchase receipt. Don\'t have a key yet? <button type="button" id="licenseGcashChoiceBtn" style="background:none; border:none; color: #005ce6; font-weight:700; text-decoration:underline; cursor:pointer; font-size:13px; padding:0; margin-right:8px;">📱 Pay via GCash (₱880)</button> or <a href="https://resumeprotemplate.gumroad.com/l/generated-resume" id="licenseGumroadLink" style="color: var(--primary, #2952E3); font-weight: 700; text-decoration: underline;" target="_blank" rel="noopener">💳 Pay with Card ($15)</a>';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'e.g. A1B2C3D4-E5F6G7H8-...';
  input.style.cssText = 'width: 100%; padding: 10px 12px; border: 1px solid var(--border, #e2e2e2); border-radius: 8px; font-size: 14px; margin-bottom: 10px; box-sizing: border-box;';

  const status = document.createElement('div');
  status.style.cssText = 'font-size: 13px; margin-bottom: 12px; min-height: 18px;';

  const unlockBtn = document.createElement('button');
  unlockBtn.type = 'button';
  unlockBtn.textContent = 'Unlock & Continue';
  unlockBtn.style.cssText = 'width: 100%; background: var(--primary, #2952E3); color: white; border: none; padding: 11px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'width: 100%; background: transparent; color: var(--ink-soft, #6b7280); border: none; padding: 8px; font-size: 13px; cursor: pointer; margin-top: 6px;';
  cancelBtn.addEventListener('click', () => { overlay.style.display = 'none'; pendingAfterVerify = null; });

  unlockBtn.addEventListener('click', async () => {
    const key = input.value.trim();
    if (!key) { status.textContent = 'Enter a license key first.'; status.style.color = '#C0392B'; return; }
    unlockBtn.disabled = true;
    status.textContent = 'Checking...';
    status.style.color = 'var(--ink-soft, #6b7280)';

    const result = await verifyLicenseKey(key);
    unlockBtn.disabled = false;

    if (result.valid) {
      status.textContent = 'Unlocked!';
      status.style.color = '#1E8E5A';
      setTimeout(() => {
        overlay.style.display = 'none';
        if (pendingAfterVerify) { pendingAfterVerify(); pendingAfterVerify = null; }
      }, 400);
    } else {
      status.textContent = result.reason || 'Invalid license key.';
      status.style.color = '#C0392B';
    }
  });

  box.appendChild(heading);
  box.appendChild(sub);
  sub.querySelector('#licenseGcashChoiceBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    overlay.style.display = 'none';
    openPaymentOptionsModal();
  });
  box.appendChild(input);
  box.appendChild(status);
  box.appendChild(unlockBtn);
  box.appendChild(cancelBtn);
  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.style.display = 'none'; });
  document.body.appendChild(overlay);

  licenseModalEls = { overlay, input, status, gumroadLink: sub.querySelector('#licenseGumroadLink') };
  return licenseModalEls;
}

// Call as requireLicense(() => { ...actual download/publish logic... }).
// Three paths:
//   1. Already verified this visit -> run immediately.
//   2. A key arrived via Gumroad's redirect URL but hasn't been verified yet
//      -> verify it NOW, using the template the user has actually selected
//      at this moment (not whatever was selected on page load, which may
//      have been the default). This is why the URL-check below stores the
//      key rather than verifying it immediately on load.
//   3. Neither -> show the manual entry modal.
function requireLicense(onVerified) {
  // Only skip re-verification if we already unlocked THIS SAME template.
  // Switching the template dropdown means a different template is now being
  // requested, which the backend needs to re-check against the one-key-one-
  // template lock -- a prior success for a different template doesn't count.
  if (window.__licenseVerified && window.__licenseVerifiedTemplate === templateKey()) {
    onVerified();
    return;
  }

  if (window.__pendingUrlLicenseKey) {
    const key = window.__pendingUrlLicenseKey;
    verifyLicenseKey(key).then(result => {
      if (result.valid) {
        onVerified();
      } else {
        // The URL-provided key didn't work for this template (e.g. it's
        // already locked to a different one) — fall back to the manual
        // modal so the person can see why and decide what to do.
        window.__pendingUrlLicenseKey = null;
        showLicenseModal(onVerified, result.reason);
      }
    });
    return;
  }

  showLicenseModal(onVerified);
}

function showLicenseModal(onVerified, prefilledError) {
  const { overlay, input, status, gumroadLink } = ensureLicenseModal();
  status.textContent = prefilledError || '';
  status.style.color = '#C0392B';
  input.value = '';
  pendingAfterVerify = onVerified;
  if (gumroadLink) {
    gumroadLink.href = CHECKOUT_URL_BY_TEMPLATE[templateKey()] || DEFAULT_CHECKOUT_URL;
  }
  overlay.style.display = 'flex';
  input.focus();
}

// Automatic path: Gumroad's post-purchase redirect can append
// ?license_key=... to the URL. The key is stored for use at the actual
// moment of download (see requireLicense above) rather than verified here
// immediately — verifying now would lock it to whatever template happens
// to be selected by default on page load, before the customer has actually
// chosen what they want. The URL itself is still cleaned up right away so
// the key doesn't linger visibly in the address bar or browser history.
(function checkUrlForLicenseKey() {
  const params = new URLSearchParams(window.location.search);
  const keyFromUrl = params.get('license_key');
  if (keyFromUrl) {
    window.__pendingUrlLicenseKey = keyFromUrl;
    params.delete('license_key');
    const cleanUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    window.history.replaceState({}, '', cleanUrl);
  }
})();


// Wire these up to buttons in your existing page:
//   <button id="previewBtn">Live preview</button>
//   <button id="downloadSiteBtn">Download full site (.zip)</button>
//   <button id="publishBtn">Publish now</button>
//   <div id="previewStatus"></div>
//   <div id="publishStatus"></div>
//   <div id="publishResult"></div>
document.getElementById('previewBtn')?.addEventListener('click', () => {
  const currentObj = (typeof lastResult !== 'undefined' && lastResult) || window.lastResult;
  if (!currentObj) { alert('Generate first.'); return; }
  renderPreview(currentObj); // preview stays free, no license check
});
document.getElementById('downloadSiteBtn')?.addEventListener('click', () => {
  const currentObj = (typeof lastResult !== 'undefined' && lastResult) || window.lastResult;
  if (!currentObj) { alert('Generate first.'); return; }
  requireLicense(() => downloadFullSite(currentObj));
});
document.getElementById('publishBtn')?.addEventListener('click', () => {
  const currentObj = (typeof lastResult !== 'undefined' && lastResult) || window.lastResult;
  if (!currentObj) { alert('Generate first.'); return; }
  requireLicense(() => publishSite(currentObj));
});


function updatePublishButtonState() {
  const publishBtn = document.getElementById('publishBtn');
  if (publishBtn) {
    const curId = getPublishedResumeId();
    publishBtn.textContent = curId ? 'Update published site →' : 'Publish My Website — $15';
  }
}

if (typeof templateSelect !== 'undefined' && templateSelect) {
  templateSelect.addEventListener('change', updatePublishButtonState);
}
if (typeof categorySelect !== 'undefined' && categorySelect) {
  categorySelect.addEventListener('change', updatePublishButtonState);
}
updatePublishButtonState();


// ============================================================================
// IN-APP TEMPLATE QUICK PREVIEW MODAL (Zero tab-switching)
// Allows visitors to preview templates in a live responsive modal right inside
// the builder without navigating away or losing any input data.
// ============================================================================
const ALL_TEMPLATE_METADATA = {
  style1: { name: 'Timeless', desc: 'Clean, single-column classic layout. Great for corporate, legal, or traditional roles.' },
  style2: { name: 'Sleek', desc: 'Modern two-column layout with left sidebar and high visual balance.' },
  style3: { name: 'Executive', desc: 'Authoritative, structured design for managers and experienced professionals.' },
  style4: { name: 'Vivid', desc: 'Bold, high-energy layout with vibrant headers and dynamic accents.' },
  style5: { name: 'Pure', desc: 'Ultra-minimalist, typography-first aesthetic with maximum legibility.' },
  style6: { name: 'Refined', desc: 'Elegant editorial design with sophisticated margins and serif accents.' },
  style7: { name: 'Dynamic', desc: 'Creative modern layout for designers, tech workers, and marketers.' },
  style8: { name: 'SkillFocus', desc: 'Highlights capabilities, certifications, and technical tool stacks.' },
  style9: { name: 'Corporate', desc: 'Polished enterprise styling for consulting, finance, and operations.' },
  style10: { name: 'Trendy', desc: 'Vibrant, stylish layout with contemporary cards and badges.' },
  style11: { name: 'Horizon', desc: 'Expansive header layout with smooth section dividers.' },
  style12: { name: 'Midnight', desc: 'Deep dark-mode luxury theme with high-contrast text.' },
  style13: { name: 'Ember', desc: 'Warm terracotta and charcoal accents with great readability.' },
  style14: { name: 'Canvas', desc: 'Clean grid-based design for portfolio-heavy careers.' },
  style15: { name: 'Graphite', desc: 'Monochromatic industrial aesthetic with razor-sharp structure.' },
  style16: { name: 'Ivory', desc: 'Warm cream tones and subtle borders for a high-end feel.' },
  style17: { name: 'Storm', desc: 'Cool slate-blue palette with balanced two-column sections.' },
  style18: { name: 'Linen', desc: 'Organic warm tones and editorial typography.' },
  style19: { name: 'Prism', desc: 'Clean white canvas with spectrum accents and interactive cards.' },
  style20: { name: 'Obsidian', desc: 'Deep black with gold accents for executive presence.' },
  style21: { name: 'Aurora', desc: 'Soft gradient accents with modern floating cards.' },
  style22: { name: 'Meridian', desc: 'Structured timeline layout for sequential career progression.' },
};

function getActiveStyleKey() {
  const sel = document.getElementById('templateSelect');
  if (!sel) return 'style1';
  const val = sel.value || 'style1';
  return (typeof NAME_TO_STYLE_KEY !== 'undefined' && NAME_TO_STYLE_KEY[val]) ? NAME_TO_STYLE_KEY[val] : val;
}

function updateQuickPreviewBar() {
  const styleKey = getActiveStyleKey();
  const meta = ALL_TEMPLATE_METADATA[styleKey] || { name: styleKey, desc: '' };
  
  const nameEl = document.getElementById('quickPreviewSelectedName');
  if (nameEl) nameEl.textContent = meta.name;
  
  const thumbEl = document.getElementById('quickPreviewThumb');
  if (thumbEl) {
    thumbEl.src = `../thumbnails/${styleKey}.jpg`;
    thumbEl.style.display = 'block';
  }
}

function openTemplateQuickPreviewModal(targetStyleKey) {
  let styleKey = targetStyleKey || getActiveStyleKey();
  let modal = document.getElementById('tplQuickPreviewModal');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'tplQuickPreviewModal';
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.82);
      backdrop-filter: blur(4px);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 14px;
      font-family: inherit;
    `;

    modal.innerHTML = `
      <div style="background: #ffffff; width: 100%; max-width: 1200px; height: 92vh; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4); border: 1px solid #cbd5e1;">
        <!-- Top Toolbar -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 18px; border-bottom: 1px solid #e2e8f0; background: #ffffff; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <span style="font-size: 13.5px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 6px;">
              👁️ Template Preview:
            </span>
            <select id="tplModalSelect" style="padding: 5px 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 13px; font-weight: 600; color: #1e293b; background: #f8fafc; cursor: pointer; outline: none;"></select>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="display: inline-flex; background: #f1f5f9; padding: 2px; border-radius: 6px; border: 1px solid #e2e8f0;">
              <button type="button" id="tplModalDesktopBtn" style="padding: 4px 10px; font-size: 11.5px; font-weight: 600; border: none; background: #2563eb; color: #ffffff; border-radius: 4px; cursor: pointer;">Desktop</button>
              <button type="button" id="tplModalMobileBtn" style="padding: 4px 10px; font-size: 11.5px; font-weight: 600; border: none; background: transparent; color: #475569; border-radius: 4px; cursor: pointer;">Mobile</button>
            </div>
            <button type="button" id="tplModalUseBtn" style="background: #10b981; color: #ffffff; border: 1px solid #059669; padding: 6px 16px; border-radius: 6px; font-size: 12.5px; font-weight: 700; cursor: pointer; box-shadow: 0 1px 3px rgba(16,185,129,0.2); transition: all 0.15s ease;">
              ✓ Use This Template
            </button>
            <button type="button" id="tplModalCloseBtn" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
              ✕ Close
            </button>
          </div>
        </div>

        <!-- Iframe Container -->
        <div id="tplModalIframeWrap" style="flex: 1; background: #f1f5f9; overflow: auto; display: flex; justify-content: center; align-items: stretch; position: relative; padding: 0;">
          <iframe id="tplModalIframe" style="width: 100%; height: 100%; border: none; background: #ffffff; transition: width 0.25s ease;" loading="lazy"></iframe>
        </div>

        <!-- Bottom Status Bar -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 18px; border-top: 1px solid #e2e8f0; background: #f8fafc; font-size: 12.5px; color: #64748b; flex-wrap: wrap; gap: 8px;">
          <div id="tplModalDesc" style="color: #334155;">
            Like this design? Click <strong>"Use This Template"</strong> to continue creating your resume.
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <button type="button" id="tplModalBottomCloseBtn" style="background: transparent; border: none; color: #64748b; font-size: 12px; cursor: pointer; text-decoration: underline;">
              Close Preview
            </button>
            <button type="button" id="tplModalBottomUseBtn" style="background: #2563eb; color: #ffffff; border: none; padding: 6px 16px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; box-shadow: 0 1px 3px rgba(37,99,235,0.2);">
              ✓ Select & Continue Upload
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Populate the dropdown inside the modal
    const modalSelect = modal.querySelector('#tplModalSelect');
    modalSelect.innerHTML = Object.entries(ALL_TEMPLATE_METADATA).map(([key, data]) => {
      return `<option value="${key}">${data.name} (${key})</option>`;
    }).join('');

    // Switch template inside modal
    modalSelect.addEventListener('change', () => {
      loadTemplateInModal(modalSelect.value);
    });

    // Device toggles
    const desktopBtn = modal.querySelector('#tplModalDesktopBtn');
    const mobileBtn = modal.querySelector('#tplModalMobileBtn');
    const iframe = modal.querySelector('#tplModalIframe');
    const iframeWrap = modal.querySelector('#tplModalIframeWrap');

    desktopBtn.addEventListener('click', () => {
      desktopBtn.style.background = '#2563eb';
      desktopBtn.style.color = '#ffffff';
      mobileBtn.style.background = 'transparent';
      mobileBtn.style.color = '#475569';
      iframe.style.width = '100%';
      iframe.style.maxWidth = '100%';
      iframe.style.boxShadow = 'none';
      iframeWrap.style.padding = '0';
    });

    mobileBtn.addEventListener('click', () => {
      mobileBtn.style.background = '#2563eb';
      mobileBtn.style.color = '#ffffff';
      desktopBtn.style.background = 'transparent';
      desktopBtn.style.color = '#475569';
      iframe.style.width = '390px';
      iframe.style.maxWidth = '390px';
      iframe.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.2)';
      iframe.style.borderRadius = '14px';
      iframeWrap.style.padding = '16px 0';
    });

    // Close handlers
    const closeModal = () => { modal.style.display = 'none'; };
    modal.querySelector('#tplModalCloseBtn').addEventListener('click', closeModal);
    modal.querySelector('#tplModalBottomCloseBtn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // "Use This Template" handlers
    const applyAndClose = () => {
      const chosenStyleKey = modalSelect.value;
      setMainBuilderTemplate(chosenStyleKey);
      closeModal();
    };
    modal.querySelector('#tplModalUseBtn').addEventListener('click', applyAndClose);
    modal.querySelector('#tplModalBottomUseBtn').addEventListener('click', applyAndClose);
  }

  // Load the target template
  const modalSelect = modal.querySelector('#tplModalSelect');
  if (modalSelect) modalSelect.value = styleKey;
  loadTemplateInModal(styleKey);
  modal.style.display = 'flex';
}

function loadTemplateInModal(styleKey) {
  const modal = document.getElementById('tplQuickPreviewModal');
  if (!modal) return;

  const iframe = modal.querySelector('#tplModalIframe');
  const descEl = modal.querySelector('#tplModalDesc');
  const meta = ALL_TEMPLATE_METADATA[styleKey] || { name: styleKey, desc: 'Professional resume layout.' };

  if (descEl) {
    descEl.innerHTML = `<strong>${meta.name}:</strong> ${meta.desc}`;
  }

  // Live hosted demo URL (works on all origins and local environments)
  const targetUrl = `https://apdg21.github.io/editableresume/${styleKey}/`;
  if (iframe) {
    iframe.src = targetUrl;
  }
}

function setMainBuilderTemplate(styleKey) {
  const sel = document.getElementById('templateSelect');
  if (!sel) return;

  // Match either styleKey (style1) or schema name (TIMELESS)
  for (let i = 0; i < sel.options.length; i++) {
    const optVal = sel.options[i].value;
    const normalized = (typeof NAME_TO_STYLE_KEY !== 'undefined' && NAME_TO_STYLE_KEY[optVal]) ? NAME_TO_STYLE_KEY[optVal] : optVal;
    if (normalized === styleKey || optVal === styleKey) {
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      break;
    }
  }
  updateQuickPreviewBar();
}

// Wire up the quick preview button on DOM load
function initQuickPreviewTriggers() {
  const btn = document.getElementById('openTemplateQuickPreviewBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      openTemplateQuickPreviewModal();
    });
  }

  const sel = document.getElementById('templateSelect');
  if (sel) {
    sel.addEventListener('change', updateQuickPreviewBar);
    updateQuickPreviewBar();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initQuickPreviewTriggers);
} else {
  initQuickPreviewTriggers();
}
// Also re-run after short delays to catch async schema loading
setTimeout(updateQuickPreviewBar, 500);
setTimeout(updateQuickPreviewBar, 1500);
