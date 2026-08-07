# Agent Tab Lights

Agent Tab Lights adds a coloured status dot to a browser tab title while your
coding agent is working, so you can tell from the tab strip whether it has
finished. It preserves each site's own favicon and does not require an API key.

**Current version: v0.2.0**

## Supported surfaces

| Surface | Where it runs |
| --- | --- |
| ChatGPT | `chatgpt.com`, `chat.openai.com` |
| Claude | `claude.ai` |
| Claude Code panel | GitHub Codespaces, `vscode.dev` |
| Codex panel | GitHub Codespaces, `vscode.dev` |

The two VS Code panels are detected in graphical sidebar-panel mode. Running the
agent as a CLI in the integrated terminal is **not** detected: VS Code renders
its terminal to a canvas, so there is no DOM text to read.

## Status colours

- 🟠 Orange: the agent is working.
- 🟢 Green: the agent has finished.
- 🟡 Yellow: the agent needs an approval or another response.
- 🔴 Red: the agent has encountered an error.
- No dot: no work has been observed in the current conversation.

Each site's original favicon is never replaced. Green remains visible until
another task starts, the page is refreshed, or you navigate to another
conversation. Red currently persists the same way, even after the error clears.

## Install in Chrome

1. Extract `agent-tab-lights-v0.2.0.zip`.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** in the top-right corner.
4. Select **Load unpacked**.
5. Choose the extracted `agent-tab-lights` folder.
6. Refresh any agent tabs that were already open.

## Test it

1. Open `https://chatgpt.com`, `https://claude.ai`, or a Codespace with the
   Claude Code or Codex panel open.
2. Send a prompt that takes several seconds.
3. Confirm the tab turns orange while the agent works.
4. Confirm the tab turns green shortly after the response finishes.

## Privacy

The extension runs entirely inside Chrome. It inspects a small set of interface
controls and status messages to determine the current state. It does not send,
save, or upload chat content, and it makes no network requests of its own.

It requests no API permissions. The install prompt lists the sites above because
reading their interface requires site access, and nothing beyond that.

## How it works

Detection is kept separate from the tab-colour logic, so a new provider is a
data-only addition.

```
lib/detector-kit.js    shared DOM helpers; turns a selector profile into a detector
lib/state-machine.js   working -> done transitions and the completion debounce
lib/tab-title.js       renders the dot onto document.title
lib/watcher.js         mutation observer, interval safety net, teardown
lib/protocol.js        message names and multi-panel state merging
detectors/*.js         one selector profile per provider
content-top.js         runs in the top frame and owns the title
content-frame.js       runs in VS Code webview iframes and only reports state
background.js          relays frame reports to the tab's top frame
```

`chatgpt.com` and `claude.ai` are single-document cases: `content-top.js`
detects and renders in the same frame.

Codespaces is not. A VS Code panel lives in a sandboxed, cross-origin iframe
that cannot reach the top-level `document.title`, so detection and presentation
are split: `content-frame.js` reports state from inside the panel,
`background.js` relays it, and `content-top.js` renders it. When more than one
panel is open, the states are merged so that "still working" wins.

Because `content-frame.js` is injected into every webview in the workbench,
including markdown previews and the settings editor, each frame detector has an
`identify` gate. A frame that does not identify as an agent panel reports
nothing at all.

## Updating selectors

Provider markup changes over time. To capture what a provider currently exposes,
paste [`tools/capture-state.js`](tools/capture-state.js) into the DevTools
console, then:

```js
AgentTabLightsCapture.record(60)   // drive a full prompt cycle
AgentTabLightsCapture.copy()       // copy the transcript
```

For a VS Code panel, switch the console context dropdown from `top` to the
webview frame first. Feed the transcript back into the relevant file in
`detectors/`.

## Tests

```sh
npm test
```

Note that `node --test tests/` does not work on current Node versions, which
resolve `tests` as a module path; the script uses a glob instead.

## If the colour does not change

Interfaces change over time. First reload the extension from
`chrome://extensions`, then refresh the tab. For a Codespace, also confirm the
panel is open in graphical mode rather than as a terminal CLI. If it still does
not work, the selectors in `detectors/` may need updating — see
[Updating selectors](#updating-selectors).
