# Privacy Policy — Breathe & Stretch

_Last updated: March 2026_

Hi! We wrote this in plain English because you deserve to know exactly what this extension does — and doesn't do — with your data.

---

## The short version

**Breathe & Stretch never collects, transmits, or shares any data about you.** Everything stays on your device, always.

---

## What data is stored, and where

All settings and progress are saved using Chrome's built-in `chrome.storage.sync` API. This means your preferences sync across your own Chrome profile (the same way bookmarks do) — but are never sent to us, because we don't have a server.

Here's exactly what is stored:

| Key | What it holds | Why |
|-----|---------------|-----|
| `iconChoice` | Your chosen toolbar emoji (e.g. "meditator") | Remembers your icon preference |
| `audioEnabled` | `true` / `false` | Whether the singing bowl plays during breaks |
| `scanAllWindows` | `true` / `false` | Meeting detection scope (see below) |
| `customTips` | Your personal affirmations (plain text) | Mixes into your break rotation |
| `breaksCompleted` | A count (integer) | Powers the Zen Garden progress |
| `totalMindfulnessSeconds` | A number of seconds (integer) | Powers the "Mindful min" stat |

Nothing else is stored. There are no user IDs, no device identifiers, no timestamps beyond what Chrome itself maintains.

---

## The `tabs` permission — why we need it and what we do with it

When you enable **Smart Pause**, Breathe & Stretch checks whether you're currently in a video call before showing a break overlay. To do this, the extension uses Chrome's `tabs` permission to read the URLs of your open tabs.

**Here is the complete list of what we look for:**

- `zoom.us`
- `meet.google.com`
- `teams.microsoft.com`
- `teams.live.com`

That's it. The check happens entirely **locally, inside your browser**, using a simple `String.includes()` match. No URLs, tab titles, page contents, or any other browsing data are ever logged, stored, or sent anywhere. The result of the check (meeting detected: yes/no) is used only to decide whether to delay the break by 5 minutes.

You can also turn this feature off entirely in Settings → "Scan all windows." When disabled, the extension doesn't query any tabs at all.

---

## Permissions we do NOT request

We deliberately keep the permission surface as small as possible:

- ❌ No `history` — we never read your browsing history
- ❌ No `cookies` — we never touch cookies
- ❌ No `webRequest` — we never intercept network traffic
- ❌ No `scripting` — we use manifest-declared content scripts only
- ❌ No `identity` — we never ask you to sign in
- ❌ No remote code — every line of code ships in the extension package

---

## Third-party services

None. Breathe & Stretch makes zero network requests. There is no analytics SDK, no crash reporter, no ad network, no CDN. The extension works entirely offline.

---

## Children's privacy

Breathe & Stretch does not collect any personal information from anyone, including children under 13.

---

## Changes to this policy

If we ever change how the extension works in ways that affect privacy, we'll update this file and bump the extension version. You can always review the full source code in the extension package.

---

## Contact

Have a question or concern? Open an issue on the project repository. We're happy to explain anything in more detail.
