/* ResumePro ATS-friendly PDF generator.
 * Reads the same data.json the page renders (the builder preview intercepts
 * this fetch, so preview and published sites produce identical PDFs), flattens
 * every template's field naming into one canonical structure, and builds a
 * plain single-column PDF with a real text layer that ATS parsers can read.
 * No AI calls, no images, no custom fonts. */
(function () {
  'use strict';

  /* ---------- text helpers ---------- */

  function decodeEntities(s) {
    return String(s)
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
  }

  function clean(value) {
    if (value == null) return '';
    if (Array.isArray(value)) value = value.join(' ');
    return decodeEntities(String(value))
      .replace(/<[^>]*>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  function asArray(value) {
    if (value == null) return [];
    if (Array.isArray(value)) return value.filter(v => v != null);
    return [value];
  }

  function firstString(obj, keys) {
    for (const k of keys) {
      const v = clean(obj && obj[k]);
      if (v) return v;
    }
    return '';
  }

  function pick(obj, keys) {
    for (const k of keys) {
      const v = obj && obj[k];
      if (v != null && v !== '') return v;
    }
    return undefined;
  }

  /* ---------- normalization: any template shape -> canonical sections ---------- */

  function normalize(data) {
    const d = data || {};
    const out = { name: '', title: '', contact: [], summary: '', experience: [], education: [], skills: [], languages: [], projects: [], awards: [], references: [] };

    /* name */
    const pi = d.personalInfo || {};
    out.name = clean([pi.firstName, pi.lastName].filter(Boolean).join(' '))
      || firstString(d.profile || {}, ['name'])
      || clean(d.name)
      || clean(d.header)
      || clean(d.hero && d.hero.title)
      || '';
    out.title = firstString(d, ['title', 'jobTitle'])
      || firstString(d.profile || {}, ['title'])
      || clean(pi.jobTitle)
      || clean(d.hero && d.hero.subtitle)
      || '';
    /* "Name | Title" / "Name — Title" combined fields */
    if (!out.title && out.name) {
      const m = out.name.match(/^(.*?)\s+[|—-]\s+(.+)$/);
      if (m) { out.name = m[1].trim(); out.title = m[2].trim(); }
    }

    /* contact */
    const contact = d.contact || {};
    const pushContact = v => { v = clean(v); if (v && !out.contact.includes(v)) out.contact.push(v); };
    pushContact(contact.email || contact.Email);
    pushContact(contact.phone || contact.Phone);
    pushContact(contact.address || contact.location);
    pushContact(contact.website);
    pushContact(d.email);
    pushContact(d.phone);
    pushContact(d.location);
    pushContact(pi.email);
    pushContact(pi.phone);
    pushContact(pi.location);
    if (typeof contact === 'string') {
      // Templates like PRISM build contact as "Email: x | Phone: y | Location: z" — parse each segment.
      const kv = { email: [], phone: [], location: [], website: [] };
      contact.split('|').forEach(seg => {
        const mm = seg.match(/^\s*(email|e-mail|phone|tel|mobile|location|address|website|web)\s*:\s*(.+)$/i);
        if (!mm) return;
        const key = mm[1].toLowerCase();
        const val = clean(mm[2]);
        if (!val) return;
        if (key === 'email' || key === 'e-mail') kv.email.push(val);
        else if (key === 'phone' || key === 'tel' || key === 'mobile') kv.phone.push(val);
        else if (key === 'location' || key === 'address') kv.location.push(val);
        else kv.website.push(val);
      });
      kv.email.forEach(pushContact);
      kv.phone.forEach(pushContact);
      kv.location.forEach(pushContact);
      kv.website.forEach(pushContact);
      const em = contact.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
      if (em) pushContact(em[0]);
      if (!kv.phone.length) {
        const ph = contact.match(/(?:\+\d[\d\s().-]{6,}\d)|(?:\b0\d[\d\s().-]{6,}\d\b)/);
        if (ph) pushContact(ph[0]);
      }
    }
    asArray(contact.items).forEach(it => pushContact(it && (it.text || it.link)));
    asArray(d.socialLinks).forEach(l => pushContact(l && l.url));
    asArray(d.social_links).forEach(l => pushContact(l && l.url));
    const socials = d.socials || {};
    Object.keys(socials).forEach(k => pushContact(socials[k]));
    const footerSocials = d.footer && (d.footer.socials || d.footer.socialLinks);
    if (Array.isArray(footerSocials)) footerSocials.forEach(l => pushContact(l && (l.url || l.link)));
    else if (footerSocials && typeof footerSocials === 'object') Object.keys(footerSocials).forEach(k => pushContact(footerSocials[k]));

    /* summary */
    const about = typeof d.about === 'object' && d.about !== null ? d.about : {};
    out.summary = clean(typeof d.about === 'string' ? d.about : '')
      || clean(d.aboutMe)
      || clean(d.summary)
      || clean(about.description)
      || clean(about.text)
      || clean(d.hero && d.hero.description)
      || '';

    /* experience */
    asArray(d.experience).forEach(item => {
      const role = firstString(item, ['role', 'position', 'title']);
      const company = firstString(item, ['company', 'employer', 'organization']);
      let dates = firstString(item, ['period', 'date', 'duration', 'years', 'year']);
      if (!dates) {
        const s = firstString(item, ['start', 'startDate']);
        const e = firstString(item, ['end', 'endDate']);
        if (s || e) dates = (s || '') + (s && e ? ' – ' : '') + (e || '');
      }
      const bullets = asArray(pick(item, ['details', 'responsibilities'])).map(clean).filter(Boolean);
      const desc = clean(pick(item, ['description']));
      if (bullets.length === 0 && desc) bullets.push(desc);
      if (role || company || bullets.length) out.experience.push({ role, company, dates, bullets });
    });

    /* education */
    asArray(d.education).forEach(item => {
      const degree = firstString(item, ['degree', 'title', 'qualification']);
      const institution = firstString(item, ['institution', 'university', 'school']);
      let dates = firstString(item, ['year', 'years', 'date']);
      if (!dates) {
        const s = firstString(item, ['start', 'startDate']);
        const e = firstString(item, ['end', 'endDate']);
        if (s || e) dates = (s || '') + (s && e ? ' – ' : '') + (e || '');
      }
      const notes = clean(pick(item, ['description', 'grade', 'location', 'address']));
      if (degree || institution || dates) out.education.push({ degree, institution, dates, notes });
    });

    /* skills */
    const skillParts = [];
    asArray(d.skills).forEach(s => {
      if (typeof s === 'string') { const v = clean(s); if (v) skillParts.push(v); }
      else if (s && s.category) {
        const names = asArray(s.items).map(it => clean(it && it.name)).filter(Boolean);
        if (names.length) skillParts.push(s.category + ': ' + names.join(', '));
      } else {
        const v = clean(s && (s.name || s.skill));
        if (v) skillParts.push(v);
      }
    });
    out.skills = skillParts;

    /* languages */
    asArray(d.languages).forEach(l => {
      if (typeof l === 'string') { const v = clean(l); if (v) out.languages.push(v); }
      else {
        const name = clean(l && l.name);
        let level = clean(l && l.level);
        if (/^\d+$/.test(level)) level = '';
        if (name) out.languages.push(level ? name + ' (' + level + ')' : name);
      }
    });

    /* projects */
    asArray(d.projects).forEach(p => {
      const name = firstString(p, ['name', 'title']);
      const description = firstString(p, ['description']);
      const links = [firstString(p, ['liveUrl', 'url', 'link']), firstString(p, ['codeUrl'])].filter(Boolean);
      if (name || description) out.projects.push({ name, description, links });
    });

    /* awards */
    asArray(d.awards).forEach(a => {
      const title = firstString(a, ['title', 'name']);
      const date = firstString(a, ['date', 'year']);
      const institution = firstString(a, ['institution', 'organization']);
      const description = firstString(a, ['description']);
      if (title || date) out.awards.push({ title, date, institution, description });
    });

    /* references */
    asArray(d.references).forEach(r => {
      const name = firstString(r, ['name']);
      const role = firstString(r, ['role', 'position', 'relationship']);
      const company = firstString(r, ['company']);
      const contactInfo = firstString(r, ['contact', 'email', 'phone']);
      if (name || contactInfo) out.references.push({ name, role, company, contact: contactInfo });
    });

    return out;
  }

  /* ---------- PDF rendering ---------- */

  function buildPdf(resume) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 16;
    const CW = W - M * 2;
    let y = 0;

    const BODY = 9.5, SMALL = 8.5;
    const BLACK = [17, 24, 39];
    const GRAY = [75, 85, 99];
    const LINE = [209, 213, 219];

    function ensure(space) {
      if (y + space > H - 14) { doc.addPage(); y = M; }
    }
    function write(text, opts) {
      const o = opts || {};
      const size = o.size || BODY;
      doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.setTextColor.apply(doc, o.color || BLACK);
      const lines = doc.splitTextToSize(String(text || ''), CW - 2 - (o.indent || 0), { fontSize: size });
      lines.forEach(line => {
        ensure(size * 0.46);
        doc.text(line, M + (o.indent || 0), y, { baseline: 'top' });
        y += size * 0.46;
      });
    }
    function heading(label) {
      ensure(14);
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor.apply(doc, BLACK);
      doc.text(label.toUpperCase(), M, y, { baseline: 'top' });
      y += 5.6;
      doc.setDrawColor.apply(doc, LINE);
      doc.setLineWidth(0.3);
      doc.line(M, y, W - M, y);
      y += 3;
    }
    function bullets(items) {
      items.forEach(b => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(BODY);
        doc.setTextColor.apply(doc, BLACK);
        const lines = doc.splitTextToSize(String(b || ''), CW - 7, { fontSize: BODY });
        lines.forEach((line, i) => {
          ensure(BODY * 0.46);
          doc.text(i === 0 ? '\u2022  ' + line : line, M + (i === 0 ? 0 : 4.6), y, { baseline: 'top' });
          y += BODY * 0.46;
        });
        y += 0.6;
      });
    }

    /* header block */
    y = M;
    if (resume.name) write(resume.name, { size: 17, bold: true });
    if (resume.title) write(resume.title, { size: 11, color: GRAY });
    if (resume.contact.length) write(resume.contact.join('   |   '), { size: SMALL, color: GRAY });
    y += 2;
    doc.setDrawColor.apply(doc, BLACK);
    doc.setLineWidth(0.5);
    doc.line(M, y, W - M, y);
    y += 2;

    if (resume.summary) { heading('Summary'); write(resume.summary); }

    if (resume.experience.length) {
      heading('Experience');
      resume.experience.forEach(e => {
        ensure(12);
        const left = [e.role, e.company].filter(Boolean).join(' — ');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(BODY);
        doc.setTextColor.apply(doc, BLACK);
        const leftLines = doc.splitTextToSize(left || 'Experience', CW - 44, { fontSize: BODY });
        leftLines.forEach((line, i) => {
          ensure(BODY * 0.46);
          doc.text(line, M, y, { baseline: 'top' });
          y += BODY * 0.46;
        });
        if (e.dates) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(SMALL);
          doc.setTextColor.apply(doc, GRAY);
          doc.text(e.dates, W - M, y - BODY * 0.46 * leftLines.length, { align: 'right', baseline: 'top' });
        }
        bullets(e.bullets);
        y += 2.5;
      });
    }

    if (resume.education.length) {
      heading('Education');
      resume.education.forEach(e => {
        ensure(10);
        write([e.degree, e.institution].filter(Boolean).join(' — '), { bold: true });
        const meta = [e.dates, e.notes].filter(Boolean).join('   |   ');
        if (meta) write(meta, { size: SMALL, color: GRAY });
        y += 1.5;
      });
    }

    if (resume.skills.length) { heading('Skills'); write(resume.skills.join('  •  ')); }

    if (resume.languages.length) { heading('Languages'); write(resume.languages.join('  •  ')); }

    if (resume.projects.length) {
      heading('Projects');
      resume.projects.forEach(p => {
        ensure(10);
        write([p.name, p.description].filter(Boolean).join(' — '));
        p.links.forEach(l => write(l, { size: SMALL, color: GRAY }));
        y += 1.5;
      });
    }

    if (resume.awards.length) {
      heading('Awards');
      resume.awards.forEach(a => {
        ensure(8);
        write([a.title, a.institution].filter(Boolean).join(' — ') + (a.date ? '   (' + a.date + ')' : ''));
        if (a.description) write(a.description, { size: SMALL, color: GRAY });
        y += 1;
      });
    }

    if (resume.references.length) {
      heading('References');
      resume.references.forEach(r => {
        ensure(8);
        write([r.name, [r.role, r.company].filter(Boolean).join(', ')].filter(Boolean).join(' — '));
        if (r.contact) write(r.contact, { size: SMALL, color: GRAY });
        y += 1;
      });
    }

    doc.setProperties({
      title: (resume.name || 'Resume') + ' — Resume',
      creator: 'ResumePro',
      subject: 'ATS-friendly resume'
    });
    return doc;
  }

  /* ---------- download + button wiring ---------- */

  let busy = false;
  function downloadAtsPdf(btn) {
    if (busy) return;
    busy = true;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Generating PDF…';
    fetch('data.json')
      .then(r => r.json())
      .then(data => {
        const resume = normalize(data);
        buildPdf(resume).save(safeFileName(resume.name) + '_Resume.pdf');
        btn.innerHTML = 'PDF downloaded';
        setTimeout(() => { btn.innerHTML = original; btn.disabled = false; busy = false; }, 1800);
      })
      .catch(err => {
        console.error('ATS PDF failed:', err);
        btn.innerHTML = 'PDF failed — try again';
        setTimeout(() => { btn.innerHTML = original; btn.disabled = false; busy = false; }, 2200);
      });
  }

  function safeFileName(name) {
    const s = clean(name).replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
    return s || 'Resume';
  }

  function wireButton() {
    let target = document.getElementById('downloadPdfBtn')
      || document.querySelector('.btn-pdf')
      || document.getElementById('download-cv');
    if (target) {
      const fresh = target.cloneNode(true);
      fresh.removeAttribute('onclick');
      if (fresh.tagName === 'A') fresh.removeAttribute('href');
      target.parentNode.replaceChild(fresh, target);
      fresh.addEventListener('click', function (e) { e.preventDefault(); downloadAtsPdf(fresh); });
      return;
    }
    if (document.querySelector('.rp-ats-pdf-btn')) return;
    const style = document.createElement('style');
    style.textContent =
      '.rp-ats-pdf-btn{position:fixed;right:18px;bottom:18px;z-index:2147483000;display:inline-flex;' +
      'align-items:center;gap:8px;padding:10px 16px;border:0;border-radius:999px;background:#111827;' +
      'color:#fff;font:600 13px/1 "Segoe UI",system-ui,-apple-system,sans-serif;cursor:pointer;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.35);text-decoration:none}' +
      '.rp-ats-pdf-btn:hover{background:#000}' +
      '.rp-ats-pdf-btn:disabled{opacity:.75;cursor:default}' +
      '@media print{.rp-ats-pdf-btn{display:none!important}}';
    document.head.appendChild(style);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rp-ats-pdf-btn';
    btn.textContent = '⬇ Download PDF';
    btn.addEventListener('click', function () { downloadAtsPdf(btn); });
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireButton);
  } else {
    wireButton();
  }
  window.rpDownloadAtsPdf = downloadAtsPdf;
})();
