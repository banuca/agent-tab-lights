# Agent Tab Lights

Agent Tab Lights adds a coloured status dot to each `chatgpt.com` browser tab
title while preserving the original ChatGPT favicon. It does not require an
OpenAI API key.

## Status colours

- 🟠 Orange: ChatGPT is working.
- 🟢 Green: ChatGPT has finished.
- 🟡 Yellow: ChatGPT needs an approval or another response.
- 🔴 Red: ChatGPT has encountered an error.
- No dot: no work has been observed in the current conversation.

The original ChatGPT favicon is never replaced. Green remains visible until
another task starts, the page is refreshed, or you navigate to another
conversation.

## Install in Chrome

1. Extract `agent-tab-lights.zip`.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** in the top-right corner.
4. Select **Load unpacked**.
5. Choose the extracted `agent-tab-lights` folder.
6. Refresh any ChatGPT tabs that were already open.

## Test it

1. Open `https://chatgpt.com`.
2. Send a prompt that takes several seconds.
3. Confirm the tab turns orange while ChatGPT works.
4. Confirm the tab turns green shortly after the response finishes.

## Privacy

The extension runs entirely inside Chrome. It inspects a small set of interface
controls and status messages to determine the current state. It does not send,
save, or upload chat content.

## Current scope

Version 0.1 supports `chatgpt.com` only. The detection code is kept separate
from the tab-colour logic so additional providers, including Codex and Claude,
can be added later.

## If the colour does not change

ChatGPT's interface can change over time. First reload the extension from
`chrome://extensions`, then refresh the ChatGPT tab. If it still does not work,
the ChatGPT selectors in `chatgpt-detector.js` may need updating.
