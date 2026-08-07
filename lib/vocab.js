(function attachVocab(globalScope) {
  "use strict";

  /*
   * Shared wording and selector groups for the detector profiles.
   *
   * Selectors stay per-provider and explicit - inheriting a selector that does
   * not exist on a provider's DOM is how "main button" spread to sites without
   * a <main> landmark. What genuinely drifted five ways is the vocabulary, so
   * that is what lives here.
   */

  function escape(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Multi-word entries tolerate the punctuation and spacing a UI actually
  // ships: "Yes, continue" and "Yes continue" are the same button, and an
  // apostrophe is as likely to be a typographic ’ as a plain ' - VS Code and
  // Claude Code both render the former, so spelling only one misses the button
  // entirely.
  function pattern(phrase) {
    return escape(phrase)
      .replace(/,\s/g, ",?\\s*")
      .replace(/ /g, "\\s+")
      .replace(/'/g, "['’]");
  }

  function alternation(phrases) {
    return Array.from(new Set(phrases.filter(Boolean).map(pattern))).join("|");
  }

  // Gerunds a provider shows while a turn is in flight. Anchored to the start
  // of a live-region string so a sentence merely containing "running" is not a
  // signal.
  const workingVerbs = Object.freeze([
    "analysing",
    "analyzing",
    "browsing",
    "considering",
    "creating",
    "deciphering",
    "editing",
    "executing",
    "generating",
    "planning",
    "pondering",
    "puzzling",
    "reading",
    "reasoning",
    "researching",
    "responding",
    "reviewing",
    "running",
    "searching",
    "thinking",
    "working",
    "writing"
  ]);

  const workingPhrases = Object.freeze([
    "running command",
    "running tool",
    "tool in progress",
    "tool running",
    "working on it"
  ]);

  /*
   * Approval affordances only.
   *
   * Deliberately excludes retry / reconnect / resume and a bare "continue".
   * Those are error-recovery and resume controls that sit under finished
   * messages on every provider, and matching them turned an ordinary
   * conversation permanently yellow - which then decayed into a false green.
   * A provider whose approval button really is labelled "Continue" can opt in
   * via `extra`, but only if its selectors are scoped to a confirmation widget.
   */
  const waitingWords = Object.freeze([
    "accept",
    "accept all",
    "accept changes",
    "accept edits",
    "accept patch",
    "accept plan",
    "allow",
    "allow all",
    "allow always",
    "allow once",
    "always allow",
    "approve",
    "approve and run",
    "approve command",
    "approve edits",
    "approve plan",
    "confirm",
    "grant access",
    "run anyway",
    "run command",
    "run tool",
    "yes",
    "yes, allow all",
    "yes, and don't ask again",
    "yes, continue",
    "yes, proceed",
    "yes, run"
  ]);

  // Phrases a provider shows when a turn failed. Matched anywhere in a capped
  // length of text, so these have to be specific enough not to appear in prose.
  const errorPhrases = Object.freeze([
    "something went wrong",
    "network error",
    "there was an error",
    "connection lost",
    "connection error",
    "unexpected error",
    "internal server error",
    "request failed",
    "request timed out",
    "api error"
  ]);

  const failedToVerbs = Object.freeze([
    "load",
    "respond",
    "generate",
    "send"
  ]);

  /**
   * "<Agent> is working", or a live region that opens with a gerund.
   *
   * @param {object} [options]
   * @param {string[]} [options.agentNames]  e.g. ["claude"] -> "Claude is thinking"
   * @param {string[]} [options.extraVerbs]  provider-specific gerunds
   * @param {string[]} [options.extraPhrases] provider-specific in-flight hints
   */
  function workingText(options = {}) {
    const names = options.agentNames || [];
    const verbs = alternation(workingVerbs.concat(options.extraVerbs || []));
    const phrases = alternation(workingPhrases.concat(options.extraPhrases || []));

    const alternatives = [
      names.length ? `\\b(?:${alternation(names)})\\s+is\\s+(?:${verbs})\\b` : null,
      `\\b(?:${phrases})\\b`,
      `^(?:${verbs})(?:\\b|…|\\.\\.\\.)`
    ].filter(Boolean);

    return new RegExp(alternatives.join("|"), "i");
  }

  /**
   * Whole-string match against a button's accessible name. Anchored at both
   * ends: "Retry" must not match because a button says "Retry with a longer
   * timeout".
   */
  function waitingText(options = {}) {
    const words = waitingWords.concat(options.extra || []);
    return new RegExp(`^(?:${alternation(words)})[.!]?$`, "i");
  }

  function errorText(options = {}) {
    const phrases = errorPhrases.concat(options.extra || []);
    const verbs = failedToVerbs.concat(options.extraFailedToVerbs || []);

    return new RegExp(
      `\\b(?:${alternation(phrases)})\\b|\\bfailed to (?:${alternation(verbs)})\\b`,
      "i"
    );
  }

  /*
   * Selector groups shared across profiles. Providers spread these and append
   * their own; nothing here assumes a particular page structure.
   */
  const selectors = Object.freeze({
    // Explicit stop controls. Every entry names the action, so none of these
    // can match an ordinary Cancel button in a settings dialog.
    stopButtons: Object.freeze([
      'button[aria-label*="stop generating" i]',
      'button[aria-label*="stop response" i]',
      'button[aria-label*="stop streaming" i]',
      'button[aria-label*="interrupt" i]',
      'button[title*="stop generating" i]',
      'button[title*="stop response" i]',
      'button[data-testid*="stop-button" i]',
      '[data-testid="stop-button"]'
    ]),

    // Provider-native "a message is streaming right now" markers.
    streamingAttrs: Object.freeze([
      '[data-is-streaming="true"]',
      '[data-streaming="true"]',
      '[data-state="streaming"]',
      '[data-state="running"]'
    ]),

    // Approval prompts are always inside a modal or a purpose-built widget.
    // A bare `button` here is what made ordinary UI read as "waiting".
    approvalButtons: Object.freeze([
      '[role="dialog"] button',
      '[role="alertdialog"] button',
      'button[data-testid*="approve" i]',
      'button[data-testid*="allow" i]',
      'button[data-testid*="permission" i]',
      'button[data-testid*="confirm" i]',
      '[class*="permission" i] button',
      '[class*="approval" i] button'
    ])
  });

  const vocab = Object.freeze({
    workingText,
    waitingText,
    errorText,
    selectors,
    workingVerbs,
    workingPhrases,
    waitingWords,
    errorPhrases
  });

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.vocab = vocab;

  if (typeof module === "object" && module.exports) {
    module.exports = vocab;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
