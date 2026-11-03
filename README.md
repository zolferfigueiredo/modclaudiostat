<p align="center">
  <img src="docs/icon.png" width="128" height="128" alt="ClaudioStat icon">
</p>

<h1 align="center">modclaudiostat</h1>

<h3 align="center">Your limits, above the prompt.</h3>

<p align="center">
  A Claude Code mod that shows your Claude plan limits in a thin row just above the prompt.<br>
  You see how much of the session and the week is left while you work, without opening <code>/usage</code>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5">
  <img src="https://img.shields.io/badge/Claude_Code-mod-D97757" alt="A Claude Code mod">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="MIT license"></a>
</p>

<p align="center">
  <a href="#install"><b>Install</b></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/zolferfigueiredo/claudiostat">On your Mac's menu bar? Get ClaudioStat.</a>
</p>

`◎ S 54% 1h 13m  W 31% 3d 6h  F 4%  P 0.8%/h  B 3.1%/h  ⚙`

## Install

At the prompt of a Claude Code session in a terminal:

```
/plugin install claudiostat-rings --marketplace zolferfigueiredo/modclaudiostat
```

Answer `y` to add the marketplace, then pick a scope (**user** puts it in every session). Or, from a shell:

```bash
claude plugin install claudiostat-rings --marketplace zolferfigueiredo/modclaudiostat
```

In the Claude desktop app, click **+** next to the prompt box, then **Plugins**, **Add marketplace** with
`zolferfigueiredo/modclaudiostat`, then **Add plugin**.

The row appears above the prompt once the first reading is in. If it doesn't, start a new session.

You need:

- Claude Code, signed in with a Claude plan (not an API key)
- The Code tab of the Claude desktop app, which the row is made for

## What the letters mean

| | Limit | What it shows |
|:-:|---|---|
| **S** | Session | Your current 5-hour window, then the time to its reset |
| **W** | Week | All models this week, then the time to its reset |
| **F** | Fable | Fable only this week. Hidden below 1%, and its reset only shows when it differs from the week's |
| **P** | Pace | How fast W rose over the last hour, per hour or per working day. `0` until there are 10 minutes of readings |
| **B** | Budget | What's left of the week per working hour or per day, until the weekly reset |

The rings at the start of the row are S outside, W in the middle and F inside, each filled to its percentage. A
hand on each ring marks how much of its window has gone by. Hover the rings to see when each limit resets.

S and W change color by that hand:

- **Orange**: within 5 points of the hand, or past it but rising slower than the hand moves.
- **Red**: past the hand and still rising faster than it moves. That's 20 points an hour for S and about 0.6 for W.

A high pace alone doesn't color them. When the last reading is over an hour old, the whole row fades.

## Features

- **Always in view.** The limits sit in the row above the prompt, so you never have to ask for them.
- **Zero tokens.** A refresh reads your usage numbers and sends no prompt, so it takes nothing from your limits.
- **Never sees your login.** Claude Code adds its own credential to the request. The mod never sees or stores it.
- **One reading for every session.** Open sessions share the same numbers, so more sessions don't mean more
  requests.
- **Your working day.** The ⚙ at the end of the row opens a settings row: P and B **Per hour** (the default) or
  **Per day**, and the **Working hours** in your day (8 by default), so B spreads the week over the hours you
  actually work.

## How it works

Every 3 minutes, the mod asks Anthropic's usage endpoint (`api.anthropic.com/api/oauth/usage`) for the same
numbers `/usage` shows, using the session's own login.

- Claude Code attaches the credential to that request itself, so the mod never sees it.
- The readings of the last 6 hours and your settings are kept in the mod's own store, shared by every session.
  P and the colors are measured from those readings.
- It sends nothing anywhere else, and it reads and writes no files of yours.

## Layout

| Path | What it is |
|---|---|
| `hooks/register.tsx` | The mod: the readings, the letters, the colors and the row |
| `hooks/gear.tsx` | The ⚙ that opens and closes the settings row |
| `hooks/register.test.tsx` | Tests for the letters, the colors, pace and budget |
| `types/index.d.ts` | The values the mod keeps, and their types |
| `.claude-plugin/plugin.json` | The mod's name, version and description |
| `.claude-plugin/marketplace.json` | Makes this repository a marketplace you install the mod from |

## Getting started

To work on the mod, install it from your clone instead, for every session:

```bash
claude plugin marketplace add <path to your clone>
claude plugin install claudiostat-rings@modclaudiostat
```

Claude Code then reads the mod straight from that folder, so an edit reaches a session after `/reload-plugins`
or in the next session.

Turn on the hook that blocks commits to `main`:

```bash
git config core.hooksPath .githooks
```

## Everyday commands

Check the mod and run its tests:

```bash
claude plugin validate .
claude plugin test .
```

## Uninstall

```bash
claude plugin uninstall claudiostat-rings@modclaudiostat
```

## Disclaimer

Unofficial. Not affiliated with or endorsed by Anthropic. It reads a usage endpoint Anthropic doesn't document,
which may change or stop working at any time.

## License

[MIT](LICENSE)

## Credits

The letters, the rings and how pace, budget and the colors are worked out come from
[ClaudioStat](https://github.com/zolferfigueiredo/claudiostat), the macOS menu bar app.

---

<p align="center">
  If modclaudiostat is useful to you, please consider giving it a ⭐<br>
  It helps other Claude users find it. Thank you!
</p>

<p align="center">
  Made with ❤️ for the Claude community by <a href="https://zolfer.com">zolfer.com</a>
</p>
