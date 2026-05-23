---
name: homey-cli
description: Interact with a Homey Pro smart-home hub via the official Homey CLI (`homey api <manager> <op>`). Use to read & export flows (incl. advanced flows), discover flow cards per installed app, build or modify standard & advanced flows from JSON, control devices, set capabilities, trigger flows, manage moods, and call any local Homey API endpoint. Replaces the public `mcp__claude_ai_Homey__*` MCP — covers all 19 MCP tools plus full advanced-flow JSON schema, app inventory, device settings, ~50 API managers, and HomeyScript as a documented fallback. Triggers on Homey Pro, Athom, smart-home automation, advanced flows, `homey api`, Z-Wave/Zigbee/Matter/Thread inventory, HomeyScript.
---

# Homey CLI

This skill covers reading state, discovering capabilities, building and modifying flows, controlling devices, and falling back to raw API or HomeyScript on a Homey Pro. It is built around `homey api <manager> <op>`, which is a complete local-API client shipped with the official `homey` npm package.

## Prerequisites

Install and verify once:

```bash
npm install -g homey            # or: bun add -g homey
homey --version                  # expect 4.x+
homey login                      # browser OAuth with Athom
homey whoami                     # confirm account
homey list --json                # all Homeys on this account
```

Pick the active Homey **non-interactively** — bare `homey select` hangs in agent contexts:

```bash
homey select --id <HOMEY_ID>     # from homey list --json
homey select current             # verify
```

## ⚠️ Active-Homey discipline

Multi-Homey accounts are the #1 footgun. `homey select` caches the active Homey on disk, persistent across terminals. A script can be running against a different Homey than the user assumes — including a family member's or rental's.

**Run `homey select current` before every Medium- or High-tier operation.** Never trust prior selection across messages or sessions. See `references/pitfalls.md` for the full rationale.

## Universal flag conventions

Every `homey api <manager> <op>` subcommand supports:

| Flag | Purpose |
|---|---|
| `--json` | Raw JSON output — always use when parsing |
| `--jq '<expr>'` | Server-side jq filter — prefer over piping, keeps output small |
| `--homey-id <id>` | Target a cached Homey without `homey select` |
| `--timeout <ms>` | Request timeout, default 30000 |
| `--token` / `--address` | Token mode against a known IP, bypassing cloud |
| `--include` | Include HTTP status + headers |
| `--verbose` | Print request diagnostics to stderr |

`homey api raw` adds: `-X`, `--path`, `--header`, `--body` (supports `@file.json`), `--request-json`.

Authoritative source for any manager's ops:

```bash
homey api --help                          # list managers
homey api <manager> --help                # list ops
homey api <manager> schema                # full schema (updates per Homey release)
homey api <manager> <op> --help           # op flags
```

## Capability 1 — Read state

Pull devices, zones, flows, apps, moods. Always pair with `--json --jq` for a projection.

Quick examples (full table in `references/managers-cheatsheet.md`):

```bash
homey api zones get-zones --json --jq 'to_entries | map({id: .key, name: .value.name, parent: .value.parent})'
homey api devices get-devices --json --jq 'to_entries | map({id: .key, name: .value.name, zone: .value.zoneName, class: .value.class})'
homey api flow get-advanced-flows --json --jq 'to_entries | map({id: .key, name: .value.name, enabled: .value.enabled})'
homey api apps get-apps --json --jq 'to_entries | map({id: .key, name: .value.name, version: .value.version}) | sort_by(.name)'
```

## Capability 2 — Discover card capabilities (per app)

Three endpoints expose every flow card across every installed app. Each card definition reveals its `id`, `args` schema, expected `droptoken`, and emitted `tokens`. This is the lookup that prevents guessing.

```bash
homey api flow get-flow-card-triggers   --json   # When / Als
homey api flow get-flow-card-conditions --json   # And / En
homey api flow get-flow-card-actions    --json   # Then / Dan
```

Filter by app:

```bash
homey api flow get-flow-card-actions --json \
  --jq '.[] | select(.ownerUri | startswith("homey:app:com.sonos"))'
```

Filter by keyword in `title`:

```bash
homey api flow get-flow-card-triggers --json \
  --jq '.[] | select(.title | test("motion"; "i"))'
```

Full discovery patterns, the 12 argument types, the token system, and a worked example: see `references/flow-cards.md`.

## Capability 3 — Build / modify a flow

The 8-step workflow below is the spine of this skill. Follow it in order — even for "simple" flows. Skipping discovery (steps 2–6) is the failure mode that produces silent-broken flows.

### The 8-step flow-building workflow

1. **Clarify intent.** Write in plain language: *"When [TRIGGER], if [CONDITION], do [ACTION]."* Same for standard and advanced. (Step 0 for modify: export the current flow JSON as baseline.)
2. **Locate the trigger.** Use `homey api flow get-flow-card-triggers --json --jq` with a `select(.ownerUri | startswith("homey:app:<app>"))` or keyword filter. Yields candidate `id`s.
3. **Read the trigger spec.** Fetch the matching card; note `args` schema, `tokens` emitted, `droptoken` expected.
4. **Resolve trigger args.** For each arg type (`device`, `autocomplete`, `dropdown`, etc.), use the matching CLI lookup to obtain a valid value. Arg-type details: `references/flow-cards.md`.
5. **Repeat 2–4 for condition(s)** using `get-flow-card-conditions`. Note `inverted: true` for "is NOT".
6. **Repeat 2–4 for action(s)** using `get-flow-card-actions`. Action args may interpolate tokens with syntax `[[homey:app:<id>|<token>]]`.
7. **Compose the flow JSON.** Copy a skeleton from `assets/flow-templates/`. Generate fresh UUIDs (`uuidgen`). Fill `args`, link via `outputSuccess` / `outputTrue` / `outputFalse` / `outputError`. For advanced control cards, use building blocks from `assets/flow-templates/card-primitives/`. Field-by-field schema: `references/flow-json-schema.md`.
8. **Validate, push, verify.**
   - Run the 10-point validation checklist from `references/flow-json-schema.md` and tick each item explicitly in output.
   - On update: back up first — `homey api flow get-…-flow --id <id> --json > /tmp/homey-backup-$(date +%Y%m%d-%H%M%S)/before.json`.
   - Push: `homey api flow create-<flow|advanced-flow> --body @file.json` or `update-<flow|advanced-flow> --id <id> --body @file.json`.
   - Verify: re-fetch with `get-`, re-run validation, resolve every device/zone ref against `get-devices`/`get-zones`. **Do not trust `broken: false` alone** — Homey marks flows with dead refs as `broken: false` (case study in `references/flow-json-schema.md`).

### Workflow variants

- **Modify existing flow:** prepend step 0 (export baseline) and treat step 8 as High tier (backup required).
- **Pure exploration** ("what can this app do in flows?"): steps 2–3 only.

### What not to do

- ❌ Guess card `id`s from patterns — always `get-flow-card-*` first.
- ❌ Reuse card UUIDs between flows — fresh per flow.
- ❌ Trust `broken: false` — resolve refs manually.
- ❌ Run `update-…-flow` without a backup — it overwrites silently.
- ❌ Push without ticking every validation-checklist item.

### Before designing from scratch, check the community pattern library

`references/community-patterns.md` documents recurring shapes the Homey community has settled on — motion + sun-window light, cancellable off-timers, smoke escalation, cheapest-hour switching, two-door hallway, shared event bus via Advanced Triggers, centralised notification pipelines. Each entry names the companion app it relies on (Device Capabilities, Chronograph, Advanced Triggers, Simple Log) and points to a worked-example template in `assets/flow-templates/examples/`. Decode `H4sIAAAA…` Flow Exchanger strings the user pastes via the same reference.

## Capability 4 — Control state

Reversible state changes. Medium tier (see Risk tiers): announce before run.

```bash
# Set a capability (turn on a light)
homey api devices set-capability-value --device-id <id> --capability-id onoff --body 'true' --request-json

# Trigger a flow
homey api flow trigger-flow --id <id>
homey api flow trigger-advanced-flow --id <id>

# Set a mood (light scene)
homey api moods set-mood --id <mood-id>

# Rename / move device
homey api devices update-device --id <id> --body '{"name":"New name","zone":"<zone-id>"}'

# Enable / disable / restart app
homey api apps enable-app  --id <app-id>
homey api apps disable-app --id <app-id>
homey api apps restart-app --id <app-id>
```

Bulk capability changes use the same call in a loop; example in `references/recipes.md`.

## Capability 5 — Escape hatches

### Raw API

When a manager exposes nothing for what you need:

```bash
homey api raw --path /api/manager/<manager>/<endpoint> --json
homey api raw -X POST --path /api/manager/<m>/<e> --body '{"key":"value"}'
homey api raw -X POST --path /api/manager/<m>/<e> --body @payload.json
```

### HomeyScript (fallback only)

If a flow cannot express the logic, HomeyScript is available. **Always check first if a flow can do it.** Start at `references/homeyscript.md` — it begins with a decision tree that gates whether HomeyScript is appropriate.

## Capability 6 — Flow suggestions

Surface flow ideas and let the user pick which to build. Three sources:

1. **Agent-generated suggestions** — generate from the user's Homey inventory (devices, zones, existing flows). Use when the user asks for ideas (*"suggest flows"*, *"what can I automate"*, *"geef wat ideeën"*) and no file source is named.
2. `wishlist.json` in cwd — use directly.
3. `WISHLIST.md` in cwd — light markdown convention.

Two display modes:

- **Browser** — Reuses the `superpowers:brainstorming` visual-companion server. Rich UI with filters, status tags, devices, and four priority levels per item (Want / Maybe / Skip / Done). Best for ≥6 items or thorough triage.
- **Terminal** — `AskUserQuestion` (multiSelect) directly in chat. No browser, no server. Best for ≤6 items or quick passes.

Mode selection: honor explicit hints (*"in browser"*, *"snel"*); otherwise ask once. No auto-heuristic.

Both modes produce the same internal shape:

```json
{ "selections": [ {"id": 1, "choice": "want"}, {"id": 7, "choice": "maybe"} ] }
```

After submit, the natural next step is to build the picked flows (Capability 3) — loop one item at a time, confirm before pushing each.

Triggers, inventory query patterns, suggestion checklist by device class, JSON schema, markdown parsing convention, failure modes, and the event contract: `references/flow-suggestions.md`.

## Risk tiers

| Tier | Examples | Required steps |
|---|---|---|
| **Safe** (read) | `get-*`, `schema`, `list`, `whoami` | Run freely. |
| **Medium** (reversible state change) | `set-capability-value`, `trigger-*-flow`, `enable-app` / `disable-app`, `restart-app`, `set-device-settings`, `set-mood`, `update-device` (rename/move) | 1. `homey select current` confirm. 2. Announce before run. 3. Confirm result after run. |
| **High** (destructive / persistent) | `delete-*`, `update-flow`, `update-advanced-flow`, `uninstall-app`, `create-*-flow` on an existing name | 1. `homey select current` confirm. 2. Back up state to `/tmp` first. 3. Ask user to confirm before execute. 4. Post-push verify with `get-` + ref-resolve. |

## Coming from the public Homey MCP?

This skill replaces every `mcp__claude_ai_Homey__*` tool. Quick mapping below; full 19-tool table in `references/mcp-migration.md`.

| MCP tool | CLI equivalent |
|---|---|
| `list_*` (devices/zones/flows/apps/moods) | `homey api <manager> get-<resource>s --json` |
| `get_advanced_flow` / `get_standard_flow` | `homey api flow get-advanced-flow --id` / `get-flow --id` |
| `create_advanced_flow` / `update_advanced_flow` | `homey api flow create-advanced-flow --body @f.json` / `update-advanced-flow --id <id> --body @f.json` |
| `list_flow_*_cards` | `homey api flow get-flow-card-triggers` / `…-conditions` / `…-actions` |
| `set_devices_capabilities_values` | `homey api devices set-capability-value` (loop for bulk) |
| `start_flow` | `homey api flow trigger-flow --id` / `trigger-advanced-flow --id` |
| `set_mood` | `homey api moods set-mood --id` |
| `move_device_to_zone` / `rename_device` | `homey api devices update-device --id <id> --body '{...}'` |

Beyond the MCP, this skill also covers: raw API to ~50 managers, app inventory with versions, device settings, HomeyScript management.

## References & assets

| File | Purpose |
|---|---|
| `references/managers-cheatsheet.md` | Per-manager command index — top 3-5 ops per manager |
| `references/flow-cards.md` | Card taxonomy, discovery, 12 arg types, tokens, worked example |
| `references/flow-json-schema.md` | Authoritative JSON shape (advanced + standard), 10-point validation checklist, round-trip workflow, template usage |
| `references/homeyscript.md` | Decision tree (when not to use HomeyScript), CRUD, template walkthrough |
| `references/recipes.md` | Ready-to-paste snippets — backup, audit, bulk ops, search |
| `references/pitfalls.md` | Active-Homey discipline, broken:false trap, jq quirks, sun-offset / delay / any-all gotchas, risk-tier table |
| `references/community-patterns.md` | Recurring advanced-flow patterns observed in the Homey community + Flow Exchanger format reference |
| `references/mcp-migration.md` | Full 19-tool MCP → CLI mapping |
| `references/flow-suggestions.md` | Flow suggestions workflow (triggers, generation, browser + terminal modes), JSON schema, event contract |
| `assets/flow-templates/*.json` | 4 ready-to-customize flow skeletons (standard, simple advanced, conditional, with-control) |
| `assets/flow-templates/examples/*.json` | 6 community-pattern worked examples — house-modes setter, motion+sun-window, cancellable off-timer, smoke-detector escalation, cheapest-hour switch, two-door hallway light |
| `assets/flow-templates/card-primitives/*.json` | 8 minimal card fragments — one per advanced-flow card type |
| `assets/homeyscript-templates/*.js` | 3 minimal scripts (condition, trigger-with-tags, safe capability read) |
| `assets/wishlist-picker/template.html` | Self-contained flow-suggestions picker UI; `__WISHLIST_DATA__` placeholder substituted by the agent |
