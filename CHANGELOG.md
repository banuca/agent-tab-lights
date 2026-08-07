# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - unreleased

First release aimed at the Chrome Web Store.

### Added

- Gemini, Perplexity, DeepSeek and Le Chat (Mistral) support.
- Copilot Chat support in Codespaces and `vscode.dev`. Unlike the other agent
  panels it is native workbench UI rather than a webview, so the top frame now
  merges its own detection with the relayed panel reports instead of choosing
  between them.
- A toolbar popup showing what the extension detects on the active tab, with a
  master on/off switch and per-provider toggles. Preferences sync through
  `chrome.storage.sync`; changes apply to open tabs without a reload.
- Extension icons.
- `npm run package`, which builds the store zip from an explicit allowlist and
  fails the build on a version mismatch, a manifest reference the package would
  omit, or a syntax error in any shipped file.
- GitHub Actions for tests on every push and a release build on every `v*` tag.
- `PRIVACY.md` and store listing copy under `store/`.

### Fixed

- **Agent panels in Codespaces could be silently dead.** Detection identified a
  webview once, at injection — which is typically before the panel's app has
  rendered anything to match against. A frame that missed that window stayed
  silent for its entire life, with no retry and nothing logged. Identification
  is now retried as the DOM changes.
- **Stop buttons hidden with CSS read as "still working" forever.** Every
  provider keeps its stop control mounted between turns and hides it visually,
  which pinned tabs orange. Visibility and `aria-disabled` are now checked.
- **Ordinary buttons could turn a tab yellow, then falsely green.** The provider
  profiles matched any button on the page against approval wording that included
  "Retry", "Resume" and "Continue" — labels that sit under every finished
  message. Worse, a false "waiting" counted as evidence of work, so it decayed
  into a false "finished". Approval matching is now scoped to modals and
  confirmation widgets, and "waiting" no longer implies work happened.
- **Error banners with a Retry button were read as waiting for input**, which
  made red nearly unreachable. Same root cause as above.
- **Red never cleared.** An error persisted until the page navigated. It now
  clears once the banner goes away, and never settles to green.
- **A backgrounded tab's light could go out mid-run.** Chrome throttles timers
  in hidden tabs to roughly once a minute, which expired a still-working panel's
  report against a 12-second freshness window — precisely the case the extension
  exists for. The window is now far larger, expiry runs on a timer that
  throttling does not defeat, and both halves refresh when a tab becomes visible.
- Unhandled promise rejections on every heartbeat, from messaging the service
  worker. The guard meant to stop reporting after an extension reload never
  actually fired.
- Timer jitter made frames heartbeat at roughly half the intended rate.
- A quiet agent panel showed as "Agent" instead of its name until it first did
  something.
- The relay-mode interval, title observer and message listener were never
  released on teardown, and the local mode had no teardown at all. Following a
  link away from a streaming answer and pressing Back also used to leave the tab
  restored with a frozen dot and detection dead until a reload; both halves now
  rebuild on a back/forward-cache restore.
- The top frame's detector registry lookup could never resolve, because the
  manifest injected it before the detectors were loaded.
- An approval button labelled with a typographic apostrophe ("Yes, and don't ask
  again" as VS Code renders it) never matched, so the yellow light was missed
  for the case it is most useful in.
- Settings that failed to save — sync storage has a write-rate quota — did so
  silently, leaving the popup showing a preference that had not persisted.
- A panel that had closed kept naming the tab until something replaced it.
- Settings that failed to write left the popup's controls showing a value that
  had not been saved.

### Changed

- Four `content_scripts` blocks became two, matching the two runtime shapes
  (chat site, and workbench plus webviews). Dead match patterns removed.
- `minimum_chrome_version: 119` declared. `match_origin_as_fallback` is silently
  ignored below it, which would leave webview detection dead with no error.
- A provider's hosts now live on its detector profile rather than in a separate
  table in `content-top.js`. Forgetting that table used to leave a new provider
  silently dead.
- Shared wording moved to `lib/vocab.js`, replacing five per-provider word lists
  that had drifted apart.
- The `storage` permission is now requested, for preferences only.

### Notes for existing users

The new host matches mean Chrome treats this as a permissions change: the
extension will be disabled after updating until you re-approve it from
`chrome://extensions`.

## [0.2.0] - 2026-08-07

### Added

- Claude, Claude Code panel and Codex panel support.
- A service worker that relays state out of sandboxed VS Code webviews to the
  tab's top frame, and merges several open panels into one light.
- `identify` gates, so a non-agent webview reports nothing at all.

### Changed

- The runtime split into a top-frame script and a webview-frame script.

## [0.1.1] - 2026-07-29

### Fixed

- Version number in the README.

## [0.1.0] - 2026-07-29

### Added

- Initial release: a coloured status dot on ChatGPT tab titles.
