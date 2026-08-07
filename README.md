# Agent Tab Lights

Agent Tab Lights adds a coloured status dot to a browser tab title while your AI
agent is working, so you can tell from the tab strip whether it has finished. It
leaves each site's own favicon alone and does not require an API key.

**Current version: v0.3.0**

## Supported surfaces

| Surface | Where it runs |
| --- | --- |
| ChatGPT | `chatgpt.com`, `chat.openai.com` |
| Claude | `claude.ai` |
| Gemini | `gemini.google.com` |
| Perplexity | `perplexity.ai` |
| DeepSeek | `chat.deepseek.com` |
| Le Chat (Mistral) | `chat.mistral.ai` |
| Claude Code panel | GitHub Codespaces, `vscode.dev` |
| Codex panel | GitHub Codespaces, `vscode.dev` |
| Copilot Chat | GitHub Codespaces, `vscode.dev` |

The VS Code panels are detected in graphical sidebar-panel mode. Running an agent
as a CLI in the integrated terminal is **not** detected: VS Code renders its
terminal to a canvas, so there is no DOM text to read.

## Status colours

- 🟠 Orange: the agent is working.
- 🟢 Green: the agent has finished.
- 🟡 Yellow: the agent needs an approval or another response.
- 🔴 Red: the agent has encountered an error.
- No dot: no work has been observed in the current conversation.

Each site's original favicon is never replaced. Green remains visible until
another task starts, the page is refreshed, or you navigate to another
conversation. Red clears on its own once the error banner goes away.

## Install

**From the Chrome Web Store** — _link to follow once the v0.3.0 listing is
approved._

**From a release build:**

1. Download `agent-tab-lights-v0.3.0.zip` from the
   [latest release](https://github.com/banuca/agent-tab-lights/releases/latest).
2. Extract it.
3. Open `chrome://extensions` in Chrome 119 or newer.
4. Turn on **Developer mode** in the top-right corner.
5. Select **Load unpacked** and choose the extracted folder.
6. Refresh any agent tabs that were already open.

To build from source instead, run `npm run package` and use the zip it writes to
`dist/`.

## Popup and settings

The toolbar icon opens a small popup that shows what the extension currently
detects on the active tab, which exists mainly so breakage is visible: a broken
selector and a genuinely idle agent both show no dot, but the popup tells them
apart. On a Codespace it also reports how many agent panels are reporting.

From the same popup you can turn the extension off entirely, or switch off
individual providers. Changes apply to open tabs immediately, without a reload,
and sync across your Chrome profile via `chrome.storage.sync`.

If the popup says the extension is not active on a tab you expect it to work on,
reload the tab — content scripts are not injected into pages that were already
open when the extension was installed or updated.

## Test it

1. Open one of the sites above, or a Codespace with an agent panel open.
2. Send a prompt that takes several seconds.
3. Confirm the tab turns orange while the agent works.
4. Confirm the tab turns green shortly after the response finishes.

## Privacy

The extension runs entirely inside Chrome. It inspects a small set of interface
controls and status messages to determine the current state. It does not send,
save, or upload chat content, and it makes no network requests of its own.

Two things it changes on pages you visit:

- The tab title, which gains an emoji prefix. Tab titles are visible to anything
  that can read window titles, including screen sharing.
- Two attributes on the page's `<html>` element,
  `data-agent-tab-lights-state` and `data-agent-tab-lights-label`, provided as a
  styling and debugging hook.

The only thing it stores is your on/off preferences. It requests one API
permission, `storage`, for exactly that. The install prompt lists the sites above
because reading their interface requires site access, and nothing beyond that.

Full detail: [PRIVACY.md](PRIVACY.md).

## How it works

Detection is kept separate from the tab-colour logic, so a new provider is a
data-only addition: one file in `detectors/`, listing the hosts it applies to,
plus a match pattern in the manifest.

```
lib/detector-kit.js     shared DOM helpers; turns a selector profile into a detector
lib/vocab.js            shared wording and selector groups the profiles build on
lib/state-machine.js    working -> done transitions and the completion debounce
lib/tab-title.js        renders the dot onto document.title
lib/watcher.js          mutation observer, interval safety net, teardown
lib/protocol.js         message names, timings, and multi-source state merging
lib/settings.js         on/off preferences, shared by content scripts and popup
lib/tab-controller.js   the top-frame pipeline: merge -> state machine -> title
lib/frame-reporter.js   the webview pipeline: identify -> detect -> report
lib/relay-hub.js        which frames in which tab are reporting what
detectors/*.js          one selector profile per provider
content-top.js          wiring for the top frame
content-frame.js        wiring for VS Code webview iframes
background.js           service worker; relays frame reports to the top frame
popup/                  the toolbar popup
```

A tab's state is the merge of two sources, either of which may be absent:

- **Local** — the agent UI is in this document (the chat sites, and the Copilot
  Chat view in the VS Code workbench). `content-top.js` detects it directly.
- **Relayed** — the agent UI is in a sandboxed, cross-origin webview iframe that
  cannot reach the top-level `document.title`. `content-frame.js` reports state
  from inside the panel and `background.js` relays it.

A Codespace can have both at once, which is why they merge rather than branch.
Where several sources disagree, "still working" wins.

Because `content-frame.js` is injected into every webview in the workbench,
including markdown previews and the settings editor, each frame detector has an
`identify` gate. A frame that does not identify as an agent panel reports nothing
at all. Because a webview's app usually renders *after* the script is injected,
identification is retried as the DOM changes rather than attempted once.

## Updating selectors

Provider markup changes over time. Selectors marked `VERIFY(capture)` in
`detectors/` have not been confirmed against the live product yet. To capture
what a provider currently exposes, paste
[`tools/capture-state.js`](tools/capture-state.js) into the DevTools console,
then:

```js
AgentTabLightsCapture.record(60)   // drive a full prompt cycle
AgentTabLightsCapture.copy()       // copy the transcript
```

For a VS Code panel, switch the console context dropdown from `top` to the
webview frame first. Feed the transcript back into the relevant file in
`detectors/`.

When adding or loosening a selector, bear in mind the rule the profiles are
written to: a missed light is an acceptable failure, a wrong one is not. A
selector that matches an ordinary button will turn every conversation yellow.

## Development

```sh
npm test        # no dependencies, no browser needed
npm run icons   # regenerate icons/*.png from the design in tools/generate-icons.mjs
npm run package # build dist/agent-tab-lights-v<version>.zip
```

`npm run package` doubles as the lint step: it syntax-checks every shipped file
and fails if the manifest points at anything the package would not include.

Note that `node --test tests/` does not work on current Node versions, which
resolve `tests` as a module path; the script uses a glob instead. Node 22 or
newer is required.

## If the colour does not change

1. Open the popup. If it says the extension is not active on the tab, reload the
   tab.
2. If it names the provider but shows no activity while the agent is clearly
   working, the selectors have probably drifted — see
   [Updating selectors](#updating-selectors).
3. For a Codespace, confirm the panel is open in graphical mode rather than as a
   terminal CLI, and check the popup's panel count.
4. Failing all that, reload the extension from `chrome://extensions` and refresh
   the tab.

## Roadmap

- Desktop notification and optional sound when an agent finishes (v0.4).
- A Firefox port is under consideration; it needs a non-service-worker
  background script and `browser_specific_settings`.

## Licence

MIT — see [LICENSE](LICENSE).
