# Privacy Policy — Agent Tab Lights

**Last updated: 7 August 2026**

Agent Tab Lights collects no data. There is no server, no account, no analytics,
and no network request of any kind. Everything below is a description of what
happens locally inside your browser.

## What it reads

On the sites listed in the extension's permissions, and only those sites, it
inspects the page for interface signals that indicate what an assistant is
currently doing:

- The presence of controls such as a stop or cancel button.
- Accessibility attributes such as `aria-busy` and `aria-live`.
- Short status strings from live regions and alert banners, for example
  "Thinking…" or "Something went wrong".

Matched text is length-capped — 180 characters for progress messages, 80 for
button labels, 400 for error banners — specifically so that message content
cannot be read as a status signal. Conversation content is never read, stored,
or transmitted.

## What it changes on pages you visit

- **The tab title.** An emoji prefix (🟠 🟢 🟡 🔴) is added to
  `document.title`. Be aware that tab titles are visible to anything that can
  read window titles, including screen-sharing and screen-recording software.
- **Two attributes on the page's `<html>` element**,
  `data-agent-tab-lights-state` and `data-agent-tab-lights-label`, provided as a
  hook for user styling and debugging. A site could in principle read these to
  detect that you have the extension installed.

Nothing else on the page is modified. Site favicons are left alone.

## What it stores

One object in `chrome.storage.sync`, holding your preferences:

```json
{ "enabled": true, "providers": { "chatgpt": false } }
```

That is the whole of it — a master on/off flag and any providers you have
switched off. If Chrome profile sync is enabled, Chrome synchronises this across
your own devices as it does any other extension setting. It contains no page
content, no browsing history, no identifiers, and nothing about you.

## What crosses a boundary

Inside the extension, a VS Code agent panel reports its status to the extension's
own service worker so the tab title can be updated — a panel lives in a sandboxed
iframe that cannot reach the tab title itself. Those messages carry a single
status word (`working`, `waiting`, `error`, `idle`) and the provider's name. They
never leave the browser and never contain page content.

## What it never does

- No network requests, of any kind, to anywhere.
- No analytics, telemetry, crash reporting or usage measurement.
- No cookies, local storage, or tracking of any sort.
- No remotely-hosted code: everything that runs is in the extension package.
- No selling, sharing, or transfer of data, because none is collected.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Saves your on/off preferences. Nothing else is stored. |
| Site access to the listed AI chat sites | Reading a page's interface to determine assistant status requires access to that page. |
| Site access to `*.github.dev`, `vscode.dev`, `*.vscode-cdn.net` | VS Code in the browser hosts its AI panels inside sandboxed cross-origin iframes served from these origins. Panel status is only readable from inside those frames. Every frame script begins with a check for agent-panel markup; a frame that does not identify as an agent panel does nothing and reports nothing. |

## Source

The extension is open source and the entire behaviour described here is
verifiable: <https://github.com/banuca/agent-tab-lights>

## Changes to this policy

Any change will be committed to this file in the repository, and the date above
updated. The commit history is the full record.

## Contact

Open an issue at
<https://github.com/banuca/agent-tab-lights/issues>.
