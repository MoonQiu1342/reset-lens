# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Reset Lens is a Manifest V3 Chrome extension (no build step, no dependencies) that annotates "Resets …" text on AI usage pages. It translates in both directions: countdowns get an absolute clock time appended, and absolute times get a countdown appended. All logic lives in a single content script — `content.js` — injected on `claude.ai/*` and `chatgpt.com/*` (see `manifest.json`).

## Commands

- **Load/develop:** `chrome://extensions/` → enable Developer mode → **Load unpacked** → select this folder. After editing `content.js`, click the reload icon on the extension card, then reload the target page.
- **Regenerate icons:** `pip install -r requirements.txt` then `python make_icons.py` (regenerates `icon{16,32,48,128}.png` from code; only needed if the icon design changes).
- **Package for release:** zip the extension files into `reset-lens-v<version>.zip`. Bump `version` in `manifest.json` first; the version is mirrored in the zip filename.

There are no tests, linters, or package manager. Verification is manual against the live pages below.

## Architecture (`content.js`)

The whole extension is one IIFE. Key concepts that span the file:

- **Scope gating** — `URL_MATCHERS` (regexes) define which exact URLs are in scope. `manifest.json` deliberately matches the whole domains (`claude.ai/*`, `chatgpt.com/*`) so the script is present on cold SPA entry; `inScope()` then narrows to the real target URLs at runtime. Claude's usage page has two URL shapes (`/settings/usage` and the overlay modal `#settings/usage`) — both are matched.

- **Parse → derive label** — `deriveLabel()` is the core. It tries each regex in priority order (Claude session countdown, Claude weekly, Codex full date, Codex same-day clock) and returns a ` (…)` suffix string, or `null`. New page formats are added here as a new regex + branch.

- **Countdown drift control** — Claude renders live countdowns ("Resets in 3 hr 38 min") that React re-mounts constantly. To avoid the appended clock time creeping forward on every re-render, computed target times are cached per text node in `countdownTargets` (a WeakMap), keyed by the raw matched string, and anchored to `minuteFloor(now)`. Re-mounts within the same minute recompute to the *same* target.

- **Live countdown labels** — Injected countdowns (Codex direction) must keep ticking. `liveLabels` (Map of span→node) tracks every injected span; `refreshLiveLabels()` re-derives and updates them, and prunes spans whose source node is gone.

- **Re-scan triggers** — A `MutationObserver` (childList + characterData, subtree) calls `schedule()`, which coalesces work into a single `requestAnimationFrame`. The observer **ignores its own mutations** (nodes carrying the `STAMP` attribute) to avoid an infinite loop. Separately, `scheduleNextMinute()` re-scans aligned to the minute boundary so countdowns advance in step with the page clock.

- **Injection invariant** — Each annotation is a `<span data-reset-time-stamp="1">` inserted as a sibling right after the source text node. The original DOM text is never mutated (keeps the page's own layout/React reconciliation intact). The `STAMP` attribute is how the script recognizes and skips its own output everywhere (`scan`, the observer filter, `isOwnNode`).

- **SPA navigation** — A content script runs in an isolated world and **cannot** monkey-patch the page's `history.pushState`. Instead it uses the Navigation API (`navigatesuccess` / `currententrychange`) when available, falling back to polling `location.href` every 500ms on older Chromium, plus `popstate`/`hashchange`. Each navigation calls `syncToUrl()` → `arm()` (start observing) or `teardown()` (disconnect, clear timers and `liveLabels`).

## Gotchas

- Time math is all local-time `Date` arithmetic. `formatClock` labels today's times bare, tomorrow's with " tomorrow", and others with a weekday prefix. `formatDelta` produces `days/hr/min`. Codex absolute dates are parsed via `new Date(string)` and guarded with `isNaN`.
- When adding a new supported page, update **both** `manifest.json` `matches` (broad, for injection) and `URL_MATCHERS` (narrow, for activation).
