// functions/api/publish.js
// Publishes a generated resume site to a GitHub branch on the dedicated
// "resumepro-builds" repo. That repo has its own connected Cloudflare Pages
// project with preview deployments enabled for all branches, so pushing to
// (or updating) a personal name branch automatically builds and deploys it
// to https://<your-name>.resumepro-builds.pages.dev — no separate hosting
// API call needed beyond the GitHub API itself.
//
// Requires one secret on THIS Pages project (the one running functions/api/):
//   GITHUB_TOKEN — a fine-grained personal access token scoped to ONLY the
//   resumepro-builds repo, with Contents: Read and write permission.
//
// Re-publishing: the frontend sends the previously-returned resume_id back
// in the X-Resume-Id header, so the SAME branch gets force-updated with a
// new commit instead of a new branch (and therefore a new URL) being
// created every time.
//
// Publishing is a paid action, so the license key + template travel in the
// X-License-Key / X-License-Template headers and are verified here -- the
// client-side requireLicense() gate alone can be bypassed by POSTing here
// directly.

import { verifyLicense } from './_license.js';

const OWNER = 'apdg21';
const REPO = 'resumepro-builds';
const BASE_BRANCH = 'main';

// Every template's data.json keeps the person's name somewhere different:
// name (style1..10, 12, 13, 15..17), profile.name (style14, style20),
// header (style19), hero.title (style18), or personalInfo.firstName +
// lastName (style11, 21, 22). Pick the first non-empty string instead of
// assuming one shape, otherwise those templates all collapse to the
// "resume" fallback URL.
function extractNameFromData(data) {
  if (!data || typeof data !== 'object') return '';

  const personName = (person) => {
    if (!person || typeof person !== 'object') return '';
    if (typeof person.name === 'string' && person.name.trim()) return person.name.trim();
    const first = typeof person.firstName === 'string' ? person.firstName.trim() : '';
    const last = typeof person.lastName === 'string' ? person.lastName.trim() : '';
    return [first, last].filter(Boolean).join(' ');
  };

  const candidates = [
    data.name,
    data.fullName,
    data.header,
    data.profile && data.profile.name,
    data.hero && data.hero.name,
    data.hero && data.hero.title,
    personName(data.personalInfo),
    personName(data.personal),
    personName(data.basics),
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  const title = typeof data.htmlTitle === 'string' ? data.htmlTitle
    : typeof data.pageTitle === 'string' ? data.pageTitle
    : '';
  return title ? title.split(/[—–|-]/)[0].trim() : '';
}

export async function onRequestPost({ request, env }) {
  const token = env.GITHUB_TOKEN;
  if (!token) {
    return Response.json({ error: 'Server is missing GITHUB_TOKEN.' }, { status: 500 });
  }

  const license = await verifyLicense(
    env,
    request.headers.get('X-License-Key'),
    request.headers.get('X-License-Template')
  );
  if (!license.ok) {
    const serverError = license.status === 500;
    return Response.json(
      {
        error: license.reason || 'A valid license key is required to publish.',
        code: serverError ? 'license_server_error' : 'license_invalid',
      },
      { status: serverError ? 500 : 403 }
    );
  }

  const gh = (path, opts = {}) =>
    fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'resumepro-publish', // GitHub rejects requests with no User-Agent
        ...opts.headers,
      },
    });

  try {
    // files: { "index.html": { content, encoding }, "data.json": { content, encoding }, ... }
    const files = await request.json();
    if (!files || Object.keys(files).length === 0) {
      return Response.json({ error: 'No files received.' }, { status: 400 });
    }

    // Determine clean personal branch name with collision protection
    const incomingId = request.headers.get('X-Resume-Id');
    let branchName = incomingId;

    // --- AUTOMATIC MIGRATION FOR OLD RANDOM IDS ---
    // If incoming ID is an old random string (e.g. "5f4ef677", "resume-5f4ef677", or 8-char hex),
    // automatically migrate them to their clean, real name slug!
    const isOldHexFormat = incomingId && (
      incomingId.startsWith('resume-') ||
      /^[a-f0-9]{8}$/i.test(incomingId)
    );
    if (isOldHexFormat) {
      branchName = null; // Forces creation of the clean personal name URL
    }

    // 1. Extract name slug from header or data.json
    let slug = request.headers.get('X-Resume-Slug');
    if (!slug && files['data.json'] && files['data.json'].content) {
      try {
        slug = extractNameFromData(JSON.parse(files['data.json'].content));
      } catch (_) {}
    }

    // 2. Sanitize for DNS and Git branch compatibility
    if (slug) {
      slug = slug
        .toLowerCase()
        .trim()
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove accents
        .replace(/[^a-z0-9]+/g, '-')                      // replace non-alphanumeric with hyphens
        .replace(/^-+|-+$/g, '')                          // strip leading/trailing hyphens
        .slice(0, 30);                                    // limit length so auto-increment suffix fits
    }

    // 3. If candidate name changed completely (e.g. user previously published "john-doe"
    //    but now creates for "jane-smith"), treat as new site instead of overwriting!
    if (branchName && slug) {
      const matchesName = branchName === slug || branchName.startsWith(`${slug}-`);
      if (!matchesName) {
        branchName = null;
      }
    }

    // 4. If creating a new site (not updating an existing branch), check collisions & auto-increment:
    //    john-doe -> john-doe-2 -> john-doe-3 (protecting existing resumes from overwrite)
    if (!branchName) {
      const baseSlug = slug || 'resume';
      let candidate = baseSlug;
      let counter = 1;
      let foundAvailable = false;

      while (!foundAvailable && counter <= 50) {
        const checkRes = await gh(`/git/ref/heads/${candidate}`);
        if (checkRes.status === 404) {
          foundAvailable = true;
          branchName = candidate;
        } else if (checkRes.ok) {
          // Branch already taken by previous resume/user, try next number
          counter++;
          candidate = `${baseSlug}-${counter}`;
        } else {
          // Break on unexpected API status (e.g. rate limit)
          break;
        }
      }

      // Safe fallback if loop encountered an issue
      if (!branchName) {
        branchName = `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`;
      }
    }

    const resumeId = branchName;

    // 1. Get the base branch's latest commit + tree, to branch/build from
    const baseRefRes = await gh(`/git/ref/heads/${BASE_BRANCH}`);
    if (!baseRefRes.ok) {
      return Response.json(
        { error: `Could not read base branch "${BASE_BRANCH}": ${await baseRefRes.text()}` },
        { status: 502 }
      );
    }
    const baseRef = await baseRefRes.json();
    const baseCommit = await (await gh(`/git/commits/${baseRef.object.sha}`)).json();

    // 2. Create a blob for each file
    const treeItems = [];
    for (const [filePath, file] of Object.entries(files)) {
      const blobRes = await gh(`/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({
          content: file.content,
          encoding: file.encoding === 'base64' ? 'base64' : 'utf-8',
        }),
      });
      if (!blobRes.ok) {
        return Response.json({ error: `Failed to upload ${filePath}: ${await blobRes.text()}` }, { status: 502 });
      }
      const blob = await blobRes.json();
      treeItems.push({ path: filePath, mode: '100644', type: 'blob', sha: blob.sha });
    }

    // 3. Create a new tree based on the base tree (so nothing outside these
    //    files gets touched, but anything already on main that ISN'T
    //    overwritten here would still be inherited — keep main minimal)
    const treeRes = await gh(`/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: treeItems }),
    });
    const tree = await treeRes.json();

    // 4. Create a commit
    const commitRes = await gh(`/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message: `Publish ${branchName}`,
        tree: tree.sha,
        parents: [baseCommit.sha],
      }),
    });
    const commit = await commitRes.json();

    // 5. Create the branch (first publish) or force-update it (re-publish)
    const refCheck = await gh(`/git/ref/heads/${branchName}`);
    if (refCheck.status === 404) {
      const createRefRes = await gh(`/git/refs`, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: commit.sha }),
      });
      if (!createRefRes.ok) {
        return Response.json({ error: `Failed to create branch: ${await createRefRes.text()}` }, { status: 502 });
      }
    } else {
      const updateRefRes = await gh(`/git/refs/heads/${branchName}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha, force: true }),
      });
      if (!updateRefRes.ok) {
        return Response.json({ error: `Failed to update branch: ${await updateRefRes.text()}` }, { status: 502 });
      }
    }

    return Response.json({
      url: `https://${branchName}.${REPO}.pages.dev`,
      resume_id: resumeId,
    });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
