# Photo support fix — 6 templates

Patches `style11, 12, 13, 15, 16, 17` so photo upload/preview/download works
consistently across all 20 resume templates, matching styles 1-10.

## What was wrong

- **style11, 12, 13, 15, 16**: no photo field existed in `data.json` at all.
  The `<img>` tag was already in the HTML with a hardcoded default photo,
  just never wired to read from data.
- **style17**: `data.json` already had a `profile_image` field, but the
  template's own JavaScript never actually read it to update the image —
  a real gap in that template's original code.

## What changed in each

- `templates/styleN/index.html` — added one small block of JS in the
  render function to read the (now-existing) photo field and set the
  `<img>` element's `src`. No layout/CSS changes — every one of these
  templates already had a properly-styled photo placeholder sitting unused.
- `templates/styleN/data.json` — added the new field with the same
  `"assets/profile.jpg"` default every other template uses (the actual
  image file already existed in each template's `assets/` folder, since
  it was already the hardcoded default before).

## Deployment

Copy each `templates/styleN/index.html` and `templates/styleN/data.json`
into your live site's `templates/resume/styleN/` folder, overwriting the
existing files. `style.css` and `main.js` (where present) are unchanged —
no need to touch those.

Also update, in your `resume-portfolio-builder/` folder:
- `all_template_schemas.json`
- `resume-mappings.json`

(both included in this delivery, already reflecting the new fields).

## Verification

Tested via the mapping engine directly (not just visually assumed) —
all 6 confirmed to correctly embed a photo when run through
`applyMapping()`, and all 20 styles pass a full regression test with
zero errors after these changes.

One remaining honest note: I patched the templates' source code by direct
inspection and testing at the data level, but haven't been able to load
these in an actual browser from this sandbox. Please visually confirm the
photo actually displays correctly (positioning, sizing) on each of these
6 styles once deployed — the JS wiring is verified correct, but real
rendering in a browser is the part I can't check myself.
