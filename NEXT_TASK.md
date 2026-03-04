---
handoff_version: v1
generated_at: 2026-03-04T21:47:23Z
---

## Current Objective

Publish Breathe & Stretch to the Chrome Web Store and update the landing page with the live store URL.

The extension is feature-complete and submission-ready. A build script (`zip-build.sh`) exists. Privacy policy and Terms of Use are finalized. The only blocking gap is the placeholder Chrome Web Store URL used in `index.html` and the "Add to Chrome" button.

## Requirements

- Run `./zip-build.sh` from the project root to produce `breathe-and-stretch-1.0.0.zip`
- Submit the zip to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- Complete the store listing: description, screenshots, category (Productivity or Wellness), privacy practices disclosure
- The store listing privacy section must reference the hosted privacy policy at `https://rabbit-ship-it.github.io/breathe-stretch/` or the GitHub-rendered `PRIVACY.md`
- Once the extension is live, replace the placeholder href in `index.html`:
  ```
  href="https://chrome.google.com/webstore"
  ```
  with the real extension URL (format: `https://chromewebstore.google.com/detail/<extension-id>`)
- Commit the updated `index.html` to `main` and push so GitHub Pages reflects the live link

## Constraints

- **Manifest V3** — the extension already targets MV3; no manifest changes are required for submission
- **Permissions** — declared permissions are `alarms`, `tabs`, `storage`; the Chrome Web Store will ask for justification of `tabs` — use the Smart Pause explanation from `PRIVACY.md` verbatim
- **No remote code** — the extension makes zero network requests and ships no CDN dependencies; this satisfies the Web Store's remote code policy without any changes
- **Icons** — all four required sizes (16, 32, 48, 128 px) are present in `images/`; no additional assets needed
- **Content Security Policy** — no `content_security_policy` key is declared in `manifest.json`; the MV3 default applies and is sufficient
- **`zip-build.sh` exclusions** — the script already excludes `.git`, `.claude`, `node_modules`, `generate_icons.py`, and prior zip files; do not add extension source files to `.gitignore` as they must be included in the zip

## Success Criteria

- [ ] `breathe-and-stretch-1.0.0.zip` passes the Chrome Web Store automated review (no policy violations flagged)
- [ ] Extension is approved and publicly listed on the Chrome Web Store
- [ ] `index.html` "Add to Chrome" button links to the live store listing (no placeholder URL remains)
- [ ] GitHub Pages site (`https://rabbit-ship-it.github.io/breathe-stretch/`) loads and the CTA button works end-to-end
- [ ] Privacy policy link in the store listing resolves correctly

## Suggested Starting Points

| File | Why |
|------|-----|
| `manifest.json` | Version number, permissions, icon paths — review before zipping |
| `zip-build.sh` | Run this to produce the submission artifact |
| `PRIVACY.md` | Use the `tabs` permission explanation verbatim in the store listing |
| `index.html` | Contains the placeholder store URL that must be updated post-approval |
| `images/` | Verify all four PNG icons render correctly before submission |
| `TERMS.md` | May be required or useful for the store listing's additional URLs field |
