# Connect CreatorFlo to your AI

CreatorFlo has a built-in MCP connector. Add it to Claude, ChatGPT or Claude Code and your
AI can read your boards and cards, and write outlines, scripts, titles and new ideas
straight into them.

**Connector URL:** `https://creatorflo.io/api/mcp`

The quickest way in is the **MCP Connector** link at the bottom of CreatorFlo's sidebar
(on a phone: Profile tab). It has a one-click button for Claude and the steps below.

## Claude (web, desktop, phone)
1. Click **Connect CreatorFlo** in CreatorFlo's MCP Connector dialog, or in Claude go to
   **Settings → Connectors → Add custom connector**, name it `CreatorFlo` and paste the URL.
2. Click **Add**, then **Connect**. Sign in to CreatorFlo and choose **Allow**.
3. In Claude desktop, quit and reopen Claude if the connector doesn't appear in your chat.

Team/Enterprise Claude plans: an org owner can add it once for everyone; each person
still signs in with their own CreatorFlo account.

## ChatGPT
1. **Settings → Apps & Connectors → Advanced settings** → turn on **Developer mode**.
2. **Create** a connector: name `CreatorFlo`, the URL above, authentication **OAuth**.
3. Sign in to CreatorFlo and choose **Allow**. Pick CreatorFlo from the **+** menu in a chat.

(One-click installs in ChatGPT are only for apps in its app directory, which needs an
OpenAI review — CreatorFlo isn't listed yet.)

## Claude Code
```
claude mcp add --transport http creatorflo https://creatorflo.io/api/mcp
```
Then run `claude`, type `/mcp`, pick creatorflo and **Authenticate**.

## What it can do
| Tool | What it does |
|---|---|
| list_boards | Your profiles (own + shared), your role on each, their pipelines and steps |
| list_cards | Cards on a board, filtered by pipeline, step or text |
| get_card | One card with every box as Markdown |
| get_outline_chapters | The Outline box parsed into steps / phases / subs and the chapter list |
| update_box | Write one box: fill if empty (default), append, or replace |
| create_card | A new card in a pipeline, with any boxes filled in |
| move_card | Move a card to another step |

It acts as you: it only sees profiles you can see, viewers can read but not write, and it
never deletes anything. Every write checks the card hasn't changed since it was read, so
it never overwrites what a teammate is typing — it asks the AI to re-read instead.
You need a CreatorFlo licence to connect.

## Disconnecting
CreatorFlo → **Your profile** (bottom-left) → **Connected apps** → Disconnect. You can
also remove the connector in Claude or ChatGPT's settings.
