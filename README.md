# Reset Lens

A tiny Chrome extension that makes AI usage pages easier to read at a glance.

- On **Claude** (`claude.ai/settings/usage`), countdowns like `Resets in 3 hr 38 min` get a clock time appended: `(at 02:39 tomorrow)`.
- On **Codex** (`chatgpt.com/codex/cloud/settings/analytics`), absolute times like `Resets May 19, 2026 2:02 PM` get a countdown appended: `(in 5 day 1 hr)`.

Same idea both directions: if the page tells you "when", we tell you "how long"; if it tells you "how long", we tell you "when".

## Install (unpacked)

1. Clone or download this repo.
2. Open `chrome://extensions/`, enable **Developer mode**.
3. **Load unpacked** → select this folder.
4. Visit a supported page and reload.

## Supported pages

- `https://claude.ai/settings/usage`
- `https://chatgpt.com/codex/cloud/settings/analytics`

## How it works

A content script walks text nodes containing `Resets`, parses the format, and appends a small sibling `<span>` showing the translated time. The original text is left untouched, so the page's own layout is never broken. Countdown→clock results are cached per countdown string so they don't drift between rescans, while injected countdown labels are refreshed on a live timer so they keep moving while the page stays open.

## License

MIT — do whatever you want with it.
