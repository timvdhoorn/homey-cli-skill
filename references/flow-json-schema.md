# Flow JSON Schema

Authoritative reference for the JSON body accepted by `homey api flow create-*` and `update-*`. Card-type definitions come from the public Homey MCP's input schema and are the canonical shape — both `standard` and `advanced` flow forms.

## Contents

- [Top-level shape](#top-level-shape)
- [Advanced flow — 8 card types](#advanced-flow--8-card-types)
- [Standard flow — trigger + conditions + actions](#standard-flow--trigger--conditions--actions)
- [UUID generation](#uuid-generation)
- [10-point validation checklist](#10-point-validation-checklist)
- [Round-trip edit workflow](#round-trip-edit-workflow)
- [Case study — why `broken: false` lies](#case-study--why-broken-false-lies)
- [Using the templates](#using-the-templates)

## Top-level shape

### Advanced flow

```json
{
  "name": "string",
  "enabled": true,
  "cards": {
    "<uuid>": { "...card object..." },
    "<uuid>": { "...card object..." }
  }
}
```

`cards` is an **object keyed by UUID**, not an array. Each value is one of the 8 card types below.

### Standard flow

```json
{
  "name": "string",
  "enabled": true,
  "trigger":    { "id": "<card-def-id>", "args": {} },
  "conditions": [ { "id": "...", "args": {}, "group": "group1", "inverted": false } ],
  "actions":    [ { "id": "...", "args": {}, "group": "then" } ]
}
```

Exactly one `trigger`. `conditions` and `actions` are arrays. `conditions[].group` is `group1|group2|group3` — within a group conditions AND together, between groups they OR. `actions[].group` is `then|else`.

`actions[]` may also carry optional `delay` and `duration`:

```json
{ "id": "...", "args": {}, "group": "then",
  "delay":    { "number": "5", "multiplier": 1 },
  "duration": { "number": "30", "multiplier": 60 } }
```

`multiplier` is `1` (seconds) or `60` (minutes); `number` is a string.

## Advanced flow — 8 card types

The 8 valid `type` values cover everything the Homey advanced-flow editor offers. The UI (Dutch shown here, same in English) maps as follows:

| `type` (JSON) | UI label (NL / EN) | Required fields | Output edges |
|---|---|---|---|
| `trigger` | Als / When | `id`, `args`, `x`, `y` | `outputSuccess` |
| `condition` | En / And | `id`, `args`, `x`, `y` (+ optional `inverted`) | `outputTrue`, `outputFalse`, `outputError` |
| `action` | Dan / Then | `id`, `args`, `x`, `y` | `outputSuccess`, `outputError` |
| `start` | Start | `x`, `y` | `outputSuccess` |
| `delay` | Wacht / Delay | `x`, `y`, `args.delay.{number, multiplier}` | `outputSuccess` |
| `all` | Alle / All | `x`, `y`, `input[]` | `outputSuccess` |
| `any` | Enkel / Only | `x`, `y`, `input[]` | `outputSuccess` |
| `note` | Notitie / Note | `x`, `y`, `value`, `color` | — (decorative) |

### Non-obvious gotchas

- **"Enkel" in the UI is `"type": "any"` in JSON**, not `"only"`. The most common mistake.
- `delay.multiplier` is `1` (seconds) or `60` (minutes); `delay.number` is a **string**.
- `all` / `any` `input[]` entries use the syntax `<source-card-uuid>::<outputName>` where `outputName ∈ {outputSuccess, outputTrue, outputFalse, outputError}`. They join branches into a sync point.
- Card-IDs (keys of the `cards` object) are UUIDs. Regex: `^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`.
- `condition.inverted: true` flips the meaning ("is NOT").
- `note.color` is an enum: `yellow | red | green | blue`. `note.value` is the body text.
- `x`, `y` are canvas coordinates in the editor — required even when invisible. **Equal x-spacing does not work** because card types render at different widths: `start` ≈ 80px, `action`/`trigger`/`condition` ≈ 350px, `delay` ≈ 150px. Use variable offsets based on the preceding card type — rough rule:
  - `start → action`: +150px
  - `action → delay`: +400px
  - `delay → action`: +200px
  - `action → action`: +400px

  Worked example (linear chain `start, action, delay, action, delay, action`): x = `100, 250, 650, 850, 1250, 1450`. A flat 300px stride overlaps or gaps. Keep y constant for a horizontal chain; bump y by ~200px between branches.
- `start` is a manual entry point. Max one per flow in the UI; the API allows more but only the first is shown.
- `args` of `trigger` / `condition` / `action` are **untyped per-card** — the schema is determined by the card definition (look up via `homey api flow get-flow-card-<triggers|conditions|actions>`).

### Cards object — minimal valid example

```json
{
  "cards": {
    "00000000-0000-4000-8000-000000000001": {
      "type": "trigger",
      "id": "homey:manager:flow:programmatic_trigger",
      "args": {},
      "x": 100, "y": 100,
      "outputSuccess": ["00000000-0000-4000-8000-000000000002"]
    },
    "00000000-0000-4000-8000-000000000002": {
      "type": "action",
      "id": "homey:manager:notifications:create_notification",
      "args": { "text": "Hello" },
      "x": 400, "y": 100
    }
  }
}
```

## Standard flow — trigger + conditions + actions

Standard flows are linear, not graph-based:

1. The `trigger` fires (one and only one).
2. Each `condition` is evaluated and grouped by `group1|2|3` — within a group all conditions AND together; between groups they OR.
3. If the overall condition expression evaluates true, the `then`-group actions run; otherwise the `else`-group actions run.

```json
{
  "name": "Notify when motion detected at night",
  "enabled": true,
  "trigger": {
    "id": "homey:device:<motion-device>:motion_detected",
    "args": {}
  },
  "conditions": [
    { "id": "homey:manager:logic:time_between", "args": {"start": "22:00", "end": "06:00"},
      "group": "group1", "inverted": false }
  ],
  "actions": [
    { "id": "homey:manager:notifications:create_notification",
      "args": { "text": "Motion at night" },
      "group": "then" }
  ]
}
```

## UUID generation

Generate a fresh UUID for every card. **Never reuse UUIDs across flows** — Homey treats them as global identifiers within a flow and stale references will surface as "broken" later.

One-liner options (pick whichever is on the system):

```bash
uuidgen                                            # macOS / Linux util-linux
python3 -c 'import uuid; print(uuid.uuid4())'      # cross-platform
node -e 'console.log(crypto.randomUUID())'         # Node 14.17+
```

Generate N UUIDs at once:

```bash
for _ in $(seq 1 6); do uuidgen; done | tr 'A-Z' 'a-z'
```

Homey accepts lowercase UUIDs.

## 10-point validation checklist

Run before every `create-` or `update-` push. Tick each item explicitly in the agent's output — not silently. A no-tick is a stop-and-ask.

1. **UUIDs unique** within the `cards` object.
2. **UUID pattern** matches `^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`.
3. **Card `id` fields exist** in the respective `get-flow-card-<triggers|conditions|actions>` list — catches typos and removed cards.
4. **All output refs** (`outputSuccess`, `outputTrue`, `outputFalse`, `outputError`) point to UUIDs that exist in this flow's `cards`.
5. **`all` / `any` `input` refs** use `<uuid>::<outputName>` syntax and the named output actually exists on the source card type (e.g. a `trigger` source only emits `outputSuccess`, not `outputTrue`).
6. **Device refs in `args`** resolve against `homey api devices get-devices` — the #1 cause of silent-broken flows.
7. **Zone refs in `args`** resolve against `homey api zones get-zones`.
8. **Token refs `[[homey:app:<id>|<token>]]`** — the app exists in `homey api apps get-apps`; the token is emitted by an upstream card in this flow's graph.
9. **No orphan cards** — every card is reachable from a `start` or `trigger` by following output edges.
10. **Type-specific required fields** complete per the card-type table above (e.g. `note` has `value` + `color`; `delay` has `args.delay.{number, multiplier}`).

No JSON-Schema validator is used. The checklist forces explicit reasoning over silent rubber-stamping.

## Round-trip edit workflow

Modifying an existing flow is the most common operation. Always go through this 5-step loop:

```bash
# 1. Pick a backup directory
BACKUP="/tmp/homey-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"

# 2. Export current state
homey api flow get-advanced-flow --id <FLOW_ID> --json > "$BACKUP/before.json"

# 3. Edit (manual or scripted) — keep keys and UUIDs consistent
cp "$BACKUP/before.json" "$BACKUP/after.json"
# ... apply edits to after.json ...

# 4. Push
homey api flow update-advanced-flow --id <FLOW_ID> --body @"$BACKUP/after.json"

# 5. Verify — re-export, diff, run validation checklist on the new state
homey api flow get-advanced-flow --id <FLOW_ID> --json > "$BACKUP/verify.json"
diff "$BACKUP/after.json" "$BACKUP/verify.json"
```

For standard flows substitute `get-flow` / `update-flow`.

## Case study — why `broken: false` lies

Homey's `broken` flag on a flow is not a reliability indicator. A flow can reference a zone or device UUID that no longer exists and still report `broken: false`. Observed in the wild on a flow whose trigger zone and a luminance-sensor device had both been deleted; the flow effectively never fired its main path, but the API said it was fine.

**Implication:** post-push verification must re-resolve every `homey:device:<id>` and `homey:zone:<id>` reference in the new state against `get-devices` / `get-zones`. A passing `broken: false` check is necessary but not sufficient.

A jq one-liner that extracts all device/zone references from an advanced flow's `cards`:

```bash
homey api flow get-advanced-flow --id <FLOW_ID> --json --jq '
  .cards | to_entries | map(.value.ownerUri // empty) +
  [.cards[].args // {} | tostring | scan("homey:(?:device|zone):[a-f0-9-]+")]
  | flatten | unique
'
```

Cross-reference the output against the live `get-devices` / `get-zones` IDs to surface stale references.

## Using the templates

Templates in `assets/flow-templates/` are minimal-valid JSON skeletons. Pure `.json`, no comments (the API rejects JSONC), so usage notes live here instead.

### Decision tree — which template

| Need | Template |
|---|---|
| Standard flow (non-advanced) — single trigger, optional conditions, then/else actions | `assets/flow-templates/standard-flow.json` |
| Advanced flow — single trigger to single action | `assets/flow-templates/advanced-flow-simple.json` |
| Advanced flow — trigger to condition with true / false branches | `assets/flow-templates/advanced-flow-conditional.json` |
| Advanced flow demonstrating `start`, `delay`, `note`, `all`-join | `assets/flow-templates/advanced-flow-with-control.json` |
| Single card type as a building block | `assets/flow-templates/card-primitives/<type>.json` |

### Workflow

1. Copy the template to a working location: `cp .claude/skills/homey-cli/assets/flow-templates/advanced-flow-conditional.json /tmp/myflow.json`.
2. Regenerate UUIDs (template uses sentinel UUIDs `00000000-...-00000000000N` so they are easy to spot):
   ```bash
   uuidgen | tr 'A-Z' 'a-z'   # one per card
   ```
   Replace each sentinel UUID consistently — every reference to a given sentinel must be updated to the same new UUID.
3. Replace each `<TODO: card id from get-flow-card-*>` placeholder with a real card `id` found via the discovery commands in `flow-cards.md`.
4. Fill in `args` per the card definition's `args` schema (also from `get-flow-card-*`).
5. Run the 10-point validation checklist above.
6. Push with `homey api flow create-<flow|advanced-flow> --body @/tmp/myflow.json`.

### Card primitives

`assets/flow-templates/card-primitives/` contains the 8 advanced-flow card types as standalone JSON fragments. Each is the bare card object — no surrounding `cards: {...}` envelope. Use them as copy-paste building blocks when composing a flow card-by-card. The same sentinel-UUID convention applies.
