# v0.3.0 launch checklist

Everything here needs a real browser, a real account, or a decision — the rest is
covered by `npm test` and `npm run package`.

## 1. Verify the selectors against the live products

**This is the one blocking item.** Selectors marked `VERIFY(capture)` in
`detectors/` are informed guesses, never confirmed against the running product:
all of `copilot-chat`, `gemini`, `perplexity`, `deepseek` and `mistral`, plus the
parts of `claude-code` and `codex` that v0.3 tightened.

For each provider, paste [`tools/capture-state.js`](../tools/capture-state.js)
into the DevTools console and drive a full cycle:

```js
AgentTabLightsCapture.record(60)
AgentTabLightsCapture.copy()
```

Cover: a slow prompt (orange), completion (green), an approval prompt where the
product has one (yellow), and a forced error such as going offline mid-response
(red). For a webview panel, switch the console context dropdown from `top` to the
frame first.

Then reconcile the profile and delete the `VERIFY(capture)` comment. Bear in mind
the rule the profiles are written to: a missed light is acceptable, a wrong one
is not.

- [ ] ChatGPT
- [ ] Claude
- [ ] Gemini
- [ ] Perplexity
- [ ] DeepSeek
- [ ] Le Chat
- [ ] Claude Code panel (re-verify: the bare `cancel`/`stop` selectors were removed)
- [ ] Codex panel (same)
- [ ] Copilot Chat (entirely new, and the only detector that runs in the workbench top frame)

## 2. Smoke test a packed build

```sh
npm run package
```

Extract `dist/agent-tab-lights-v0.3.0.zip` and load **the extracted build**, not
the repo, in a clean Chrome profile.

- [ ] No warnings on `chrome://extensions`
- [ ] Icon legible at 16px in the toolbar and on the extensions page, light and dark
- [ ] Each chat provider: orange while generating, green ~1.2s after
- [ ] No yellow from a per-message Retry, "Continue generating", or an open settings dialog
- [ ] A forced error goes red, and clears on its own once the banner does
- [ ] Follow a link mid-response and press Back: the light recovers rather than freezing

## 3. Smoke test a real Codespace

- [ ] Claude Code and Codex panels open together — "working" wins the merge
- [ ] A markdown preview open alongside stays silent (the identify gate)
- [ ] Copilot Chat drives the light from the workbench itself
- [ ] Closing a panel clears the light within a few seconds, not minutes
- [ ] Background the tab for more than six minutes mid-run, then return: the light survived
- [ ] Popup reports the right panel count

## 4. Settings

- [ ] Master switch off strips the prefix and the `data-agent-tab-lights-*` attributes on already-open tabs, without a reload — check both a chat site and a Codespace
- [ ] A single provider off silences only that provider. Specifically: switching off **Copilot Chat** must leave the Claude Code panel's light working in the same tab
- [ ] Settings survive a browser restart
- [ ] Popup on an unsupported page says "Not active on this tab"
- [ ] Popup on a tab opened before installing says the same, and reloading fixes it
- [ ] Popup readable in both light and dark

## 5. Update path

- [ ] Load 0.2.0, then update to the 0.3.0 build. The new host matches make Chrome
      treat this as a permissions change, so the extension is disabled until
      re-approved. Confirm it behaves sanely and that the CHANGELOG note is accurate.

## 6. Store assets

- [ ] Three 1280×800 screenshots (see [listing.md](listing.md) — the tab strip
      needs an OS-level capture, DevTools cannot reach it)
- [ ] 440×280 promo tile from [promo-tile.html](promo-tile.html)

## 7. Publish

- [ ] Chrome Web Store developer account ($5 one-off; identity verification can take days)
- [ ] Upload the zip; fill the listing from [listing.md](listing.md) — single purpose,
      per-permission justifications, data-usage certifications, privacy policy URL
- [ ] Expect a longer review than average: the host list is broad and the workbench
      block uses `all_frames`. The identify-gate narrative in listing.md is the answer
      if a reviewer asks.

## 8. Release and follow-up

- [ ] Tag `v0.3.0` — the release workflow builds the zip and publishes the GitHub Release
- [ ] Replace the store link placeholder in the README
- [ ] `gh repo edit banuca/agent-tab-lights --homepage <store url>`
- [ ] Fix the repository description, which still advertises a "blocked" state the
      extension has never had:

      ```sh
      gh repo edit banuca/agent-tab-lights --description \
        "Chrome extension that shows in the tab title when AI chat and coding-agent tabs are working, finished, waiting for input, or hit an error."
      ```
