# HomeyScript — Fallback Only

HomeyScript is a community-maintained Homey app that runs user-written JavaScript with access to the Homey Web API. It exists for cases pure flows cannot express. **Native flows are always preferred** — they are visible in the editor, auditable, and don't depend on an extra app staying installed and compatible.

## Contents

- [Decision tree — should you use HomeyScript?](#decision-tree--should-you-use-homeyscript)
- [What HomeyScript is](#what-homeyscript-is)
- [Where scripts live and run](#where-scripts-live-and-run)
- [Managing scripts via the CLI](#managing-scripts-via-the-cli)
- [Templates](#templates)
- [Pitfalls](#pitfalls)

## Decision tree — should you use HomeyScript?

Walk this before writing a single line of JavaScript.

```
Can this be expressed as flow cards (incl. advanced flow control)?
├── YES → STOP. Use a flow. Do not proceed.
└── NO  → continue
        │
        Does it need state across runs (counters, last-seen, sliding windows)?
        ├── YES → consider Logic variables first (homey api logic).
        │        Still need it? → script is acceptable.
        └── NO  → continue
                │
                Does it need an external HTTP API with no Homey app?
                ├── YES → script is acceptable.
                └── NO  → continue
                        │
                        Does it need >5 conditions or complex branching that an
                        advanced flow becomes unreadable for?
                        ├── YES → script is acceptable.
                        └── NO  → use a flow.
```

If the answer is "use a flow", go back to the 8-step workflow in `SKILL.md` and `flow-cards.md`.

## What HomeyScript is

HomeyScript is the app `com.athom.homeyscript` (visible in `homey api apps get-apps`). It runs JavaScript inside Homey with:

- `Homey.devices.*`, `Homey.flow.*`, `Homey.zones.*`, etc. — bindings to the local API
- `fetch()` for external HTTP
- `log()` for output (visible in the script editor and Homey logs)
- `async`/`await`
- A flow-card surface so a script can be used as a trigger, condition (return boolean), or action — and can emit tags (tokens) to downstream cards

It does **not** have:

- A real filesystem
- Long-running background workers (scripts have an execution timeout)
- Native modules beyond what the runtime exposes

## Where scripts live and run

Scripts are authored in the browser at `https://my.homey.app/script`. Each script has a name and a body. Flow cards reference a script by name.

The Homey app store entry for HomeyScript is the source of truth for the runtime API; `https://athombv.github.io/com.athom.homeyscript/` hosts the reference docs.

## Managing scripts via the CLI

HomeyScript stores its scripts as app settings on the `com.athom.homeyscript` app. Inspect via:

```bash
# List the app's settings (script names appear here)
homey api apps get-app-settings --id com.athom.homeyscript --json

# Read one setting (e.g. a script body)
homey api apps get-app-setting --id com.athom.homeyscript --name <setting-name> --json

# Write a setting
homey api apps set-app-setting --id com.athom.homeyscript --name <setting-name> --body '<value>'
```

The exact storage shape depends on the HomeyScript version — verify with `get-app-settings` before assuming a specific key naming.

For bulk script management, prefer the web UI at `my.homey.app/script` — the API surface is intended for app developers, not as a primary editor.

## Templates

Three minimal templates ship under `assets/homeyscript-templates/`. Each is a starting point — copy, customize, and only deploy if the decision tree above sent you here.

### `condition-return-boolean.js`

A script used as a flow condition card ("And" / "En"). Returns boolean. Fails closed (returns `false`) when the referenced device or capability is missing — this keeps the flow's `false` branch as the safe default during outages.

Use when: a condition depends on a derived value that no built-in or app condition card exposes (e.g. "temperature has been below 18 for 30 minutes" combined with a non-Homey data source).

### `trigger-flow-with-tags.js`

A script that triggers another flow programmatically and passes dynamic string/number tokens. The target flow must use a `When this Flow is started programmatically` trigger card with matching token definitions.

Use when: tokens need to be computed from an external source (e.g. fetched from an API) before the downstream flow runs.

### `read-device-capability.js`

A safe-read helper that fetches a capability value with defensive null-handling. Returns the value or `null`. Use as a building block called by other scripts — not as a standalone flow card.

## Pitfalls

- **Async/await is required** for any `Homey.*` call. Forgetting `await` returns a `Promise` and the script appears to "succeed" while doing nothing.
- **Log truncation** — `log()` output is capped per script run. For verbose debugging, write summaries, not raw dumps.
- **No filesystem** — `fs` is unavailable. Persist state in Homey Logic variables (`homey api logic`) or app settings.
- **Execution timeout** — long-running scripts are killed. Break work into smaller scripts triggered by sequential flow cards, or use a `delay` control card between runs.
- **Globals don't persist** between runs. Each invocation starts a fresh sandbox.
- **`return` becomes the card's value** — for condition cards, `return false` and `return true` are the only meaningful boolean outcomes. For action cards, the return value is ignored unless declared as a tag.
- **`Homey.flow.runFlow` shape may differ between HomeyScript versions** — verify with the live API in the script editor before trusting any template literally.
- **Scripts are app-data on `com.athom.homeyscript`** — uninstalling or downgrading the app risks losing them. Back up via `get-app-settings` before mutating the app.

When debugging, the web UI's script editor shows live `log()` output and stack traces. Use it as the primary debugging surface; the CLI is for management and backup, not interactive iteration.
