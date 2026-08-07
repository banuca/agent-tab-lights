# Chrome Web Store listing copy

Reference text for the Web Store dashboard forms. Keep it in sync with the
manifest description and README when either changes.

- **Name:** Agent Tab Lights
- **Category:** Tools
- **Language:** English (UK)
- **Privacy policy URL:** https://github.com/banuca/agent-tab-lights/blob/main/PRIVACY.md

---

## Short description

_Limit: 132 characters. Below is 124._

```
See from the tab strip when ChatGPT, Claude, Gemini and your coding agents are working, finished, waiting, or hit an error.
```

## Detailed description

```
Agent Tab Lights adds a coloured status dot to the tab title while an AI
assistant is working, so you can tell at a glance — from the tab strip, without
switching tabs — whether it has finished.

🟠 Orange — the agent is working
🟢 Green — the agent has finished
🟡 Yellow — the agent needs an approval or another response
🔴 Red — the agent hit an error
No dot — nothing has happened in this conversation yet

WORKS WITH

• ChatGPT (chatgpt.com)
• Claude (claude.ai)
• Gemini (gemini.google.com)
• Perplexity (perplexity.ai)
• DeepSeek (chat.deepseek.com)
• Le Chat (chat.mistral.ai)
• Claude Code, Codex and Copilot Chat panels in GitHub Codespaces and vscode.dev

Agents in a Codespace are detected in graphical panel mode. An agent run as a
CLI in the integrated terminal is not detected, because VS Code draws its
terminal to a canvas and there is no text to read.

A TOOLBAR POPUP

Click the icon to see what the extension currently detects on the tab, turn it
off entirely, or switch off individual providers. Changes apply immediately,
without reloading.

PRIVACY

The extension makes no network requests of any kind. It reads a small set of
interface signals — a stop button, a status message, an error banner — to work
out what the assistant is doing. Your conversations are never read, stored or
transmitted. Nothing leaves your browser. The only thing saved is your on/off
preferences.

Open source: https://github.com/banuca/agent-tab-lights

Not affiliated with or endorsed by OpenAI, Anthropic, Google, Perplexity,
DeepSeek, Mistral AI, GitHub or Microsoft. Product names are trademarks of their
respective owners.
```

---

## Single purpose statement

```
Shows the status of the AI assistant on the current tab — working, finished,
waiting for input, or error — as a coloured dot prefixed to the tab title.
```

## Permission justifications

### `storage`

```
Saves the user's on/off preference and per-provider toggles, set from the
extension's popup. Synced through Chrome Sync so preferences follow the user's
own profile. No page content, browsing data or identifiers are stored.
```

### Host access — AI chat sites

_chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, \*.perplexity.ai,
chat.deepseek.com, chat.mistral.ai_

```
The extension reads on-page interface signals on these AI chat sites — the
presence of a stop button, aria-busy attributes, short status strings from live
regions, and error banners — to determine whether the assistant is currently
working, waiting for input, or has failed. It then prefixes the tab title with a
coloured status dot. Determining this state requires reading the page, and there
is no other source for it. Matched text is length-capped so message content
cannot be read as a signal. Nothing is transmitted anywhere.
```

### Host access — `*.github.dev`, `vscode.dev`

```
VS Code in the browser. The extension renders the status dot into the tab title
here, and detects the Copilot Chat view, which is part of the workbench document
rather than a separate frame.
```

### Host access — `*.vscode-cdn.net`, with `all_frames` and `match_origin_as_fallback`

_This is the permission most likely to draw a reviewer question. The answer is
the identify gate._

```
VS Code in the browser hosts its AI panels — Claude Code, Codex, Copilot Chat —
inside sandboxed, cross-origin iframes served from vscode-cdn.net, sometimes
with opaque origins, which is why match_origin_as_fallback is required. A panel's
status is only readable from inside its own frame, and that frame cannot reach
the top-level document.title, so the extension must inject into workbench
webviews (all_frames) and relay a status value to the top frame.

The scope is narrowed by design rather than by pattern. Every frame script begins
with an identify gate: it looks for markup specific to an agent panel, and a
frame that does not match does nothing at all — it runs no detection and sends no
message. Markdown previews, the settings editor and every other workbench webview
are therefore completely inert.

What a frame that does identify sends is a single status word — working, waiting,
error or idle — plus the provider's name, to the extension's own service worker.
No page content is read out, stored or transmitted, and the extension makes no
network requests of any kind.
```

### Remote code

```
No remote code. All logic ships in the extension package; nothing is fetched or
evaluated at runtime.
```

## Data usage declaration

Tick nothing under "What user data do you plan to collect?" — no data of any
category is collected.

Certify all three:

- [x] I do not sell or transfer user data to third parties, outside of the
      approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my
      item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for
      lending purposes

---

## Graphical assets

| Asset | Size | Source |
| --- | --- | --- |
| Store icon | 128×128 | `icons/icon-128.png` |
| Screenshot 1 — tab strip | 1280×800 | Manual, see below |
| Screenshot 2 — popup | 1280×800 | Manual, see below |
| Screenshot 3 — Codespace | 1280×800 | Manual, see below |
| Small promo tile | 440×280 | `store/promo-tile.html`, see below |

### Screenshots (manual)

The tab strip is outside the page, so DevTools cannot capture it — these need an
OS-level screenshot, cropped to exactly 1280×800.

1. **Hero.** One window with four tabs open: ChatGPT mid-generation (orange),
   Claude just finished (green), a Codespace awaiting an approval (yellow), and
   one ordinary tab for contrast.
2. **Popup.** The popup open over a working tab, showing the detected state and
   the provider list.
3. **Codespace.** A Codespace with an agent panel open and the orange dot visible
   in the tab title.

### Promo tile

Open `store/promo-tile.html`, right-click the card, and choose **Capture node
screenshot** in DevTools. Set device pixel ratio to 1 first, or halve the
resulting image — at 2× it exports 880×560.

---

## After publishing

- Add the store URL to the README install section, replacing the placeholder.
- Set the repository homepage: `gh repo edit banuca/agent-tab-lights --homepage <store url>`.
