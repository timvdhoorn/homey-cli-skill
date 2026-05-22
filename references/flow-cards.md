# Flow Cards — Discovery and Anatomy

Every Homey flow is built from **flow cards**: typed building blocks contributed by installed apps and built-in managers. This reference covers how to **discover** which cards exist, **read** their argument schemas, and **understand** the token system that flows data between cards.

For the JSON shape you push to `create-` / `update-`, see `flow-json-schema.md`. This file is the discovery counterpart.

## Contents

- [The three card categories](#the-three-card-categories)
- [Discovery — three endpoints](#discovery--three-endpoints)
- [Card definition fields](#card-definition-fields)
- [The 12 argument types](#the-12-argument-types)
- [Tokens — local, global, image](#tokens--local-global-image)
- [Droptokens](#droptokens)
- [`highlight` and `deprecated`](#highlight-and-deprecated)
- [End-to-end worked example](#end-to-end-worked-example)

## The three card categories

Standard and advanced flows both compose from three card categories. The UI labels and JSON `type` values:

| UI (NL / EN) | JSON `type` | Discovery endpoint |
|---|---|---|
| Als / When | `trigger` | `homey api flow get-flow-card-triggers` |
| En / And | `condition` | `homey api flow get-flow-card-conditions` |
| Dan / Then | `action` | `homey api flow get-flow-card-actions` |

Advanced flows additionally support 5 control cards (`start`, `delay`, `all`, `any`, `note`) that are built into the flow editor and not contributed by apps — they don't appear in the discovery endpoints and have fixed JSON shapes (see `flow-json-schema.md`).

## Discovery — three endpoints

Each endpoint returns every card definition the active Homey knows about, including every installed app and built-in manager. Counts scale with installed apps — expect hundreds of triggers alone.

```bash
homey api flow get-flow-card-triggers   --json    # When / Als cards
homey api flow get-flow-card-conditions --json    # And / En cards
homey api flow get-flow-card-actions    --json    # Then / Dan cards
```

### Filter by app

`ownerUri` carries the source: `homey:app:<app-id>`, `homey:manager:<manager>`, `homey:device:<device-id>`, `homey:zone:<zone-id>`.

```bash
# All Sonos action cards
homey api flow get-flow-card-actions --json \
  --jq '.[] | select(.ownerUri | startswith("homey:app:com.sonos"))'

# All built-in flow manager triggers
homey api flow get-flow-card-triggers --json \
  --jq '.[] | select(.ownerUri == "homey:manager:flow")'
```

### Filter by keyword

```bash
# Triggers whose title mentions "motion" (case-insensitive)
homey api flow get-flow-card-triggers --json \
  --jq '.[] | select(.title | test("motion"; "i"))'

# Actions that mention "play"
homey api flow get-flow-card-actions --json \
  --jq '.[] | select(.title | test("play"; "i")) | {id, title, ownerUri}'
```

### Filter by required input token (droptoken)

```bash
# Conditions that expect a luminance measurement
homey api flow get-flow-card-conditions --json \
  --jq '.[] | select(.droptoken? | tostring | test("measure_luminance"))'
```

### Get a single card by id

```bash
homey api flow get-flow-card-trigger --uri 'homey:flowcardtrigger:<id>' --json
```

## Card definition fields

A card definition (what you get back from the discovery endpoints) has:

| Field | Purpose |
|---|---|
| `id` | The card definition id — goes in the `id` field of your flow JSON card |
| `uri` | Full URI form: `homey:flowcard{trigger\|condition\|action}:<id>` |
| `ownerUri` | Who provides this card — app, manager, device, or zone |
| `ownerId` | The owner's own id within its namespace |
| `title` | Human-readable label, localized to the Homey's language |
| `titleFormatted` | Same as title but with arg placeholders, e.g. `"Play [[artist]]"` |
| `hint` | Tooltip text explaining the card |
| `args` | Array of argument schemas — see below. `null` if the card takes no args |
| `droptoken` | Type of token this card expects as input (conditions/actions) |
| `tokens` | Array of tokens this card emits downstream (triggers/conditions/actions can all emit) |
| `deprecated` | `true` if the card is hidden from the editor but still functional |
| `highlight` | `true` for "featured" cards shown prominently in the UI |

The `id` is what goes into your flow JSON. Everything else is metadata for selection and arg resolution.

## The 12 argument types

`args` is an array of arg-schema objects. Each has a `name`, `type`, optional `title`, `placeholder`, and type-specific fields. Resolving an arg value means producing a JSON value that matches the type.

| `type` | Resolution rule | Example value |
|---|---|---|
| `text` | Plain string | `"Hello"` |
| `autocomplete` | Object from the card's autocomplete listener — `{id, name, ...extra}` | `{"id": "abc", "name": "Beatles"}` |
| `number` | Number (or numeric string per card schema) | `42` |
| `range` | Number within `min`/`max`/`step` | `0.75` |
| `date` | ISO date string `YYYY-MM-DD` | `"2026-05-22"` |
| `time` | Time string `HH:MM` | `"19:00"` |
| `dropdown` | One `id` from the `values` enum in the schema | `"option_a"` |
| `multiselect` | Array of `id`s from `values` | `["a", "b"]` |
| `checkbox` | Boolean | `true` |
| `color` | Hex color string | `"#ff8800"` |
| `droptoken` | Token reference string (see Droptokens below) | `"homey:device:<id>|measure_temperature"` |
| `device` | Device id from `homey api devices get-devices` | `"<device-uuid>"` |

### Resolving each type

- **`device`** — look up the device id with `homey api devices get-devices --json --jq 'to_entries[] | select(.value.name == "Bedroom Lamp") | .key'`.
- **`autocomplete`** — invoke the autocomplete listener: `homey api flow get-flow-card-autocomplete --type action --uri <card-uri> --id <arg-name> --query "<search>"`. Pick a result object and use it as the arg value.
- **`dropdown` / `multiselect`** — read the `values` array from the arg schema in the card definition; pick the right `id`(s).
- **`range`** — respect `min`, `max`, and `step` in the schema.

Cards may also declare:

- `required: false` — the arg can be omitted in the flow JSON.
- `placeholder` — UI hint, ignored in JSON.

### Optional and special-purpose fields

- **Action card `duration`** — some action cards expose a `duration` field (e.g. "turn on for X seconds") with `{number, multiplier}` like delays.
- **Action card subscribed-arg listeners** — irrelevant when building flows; matters only when writing apps.

## Tokens — local, global, image

Tokens are **typed variables** that flow through the card graph.

- **Local tokens** are emitted by a trigger card and available downstream within that flow only. Example: a motion trigger emits the user who triggered it.
- **Global tokens** are emitted by an app and usable in any flow. Every device capability is automatically a global token (e.g. `measure_temperature` on a thermostat).
- **Image tokens** carry image data — camera snapshots, generated images. Same syntax, type `image`.

### Interpolation syntax

In a text/string arg you can interpolate a token with double-bracket syntax:

```
[[homey:device:<device-uuid>|measure_temperature]]
[[homey:app:com.trashchecker|trash_collection_token_tomorrow]]
[[homey:manager:weather|temperature]]
```

The general form is `[[<ownerUri>|<token-name>]]`.

### Advanced-flow Then-card tokens

A `then`-card in an advanced flow can also emit tokens — they show up in downstream cards as inputs. Look at the card definition's `tokens` array to see what it emits.

## Droptokens

A `droptoken`-typed arg requires a **token reference** (not just a string with `[[ ]]`). This is what makes a card "value-driven" — e.g. a "less than" comparison card with `droptoken` set to a number-typed token.

Reference form: `<ownerUri>|<token-name>`, e.g. `homey:device:<uuid>|measure_luminance`.

The card definition's `droptoken` field declares which token type is acceptable.

## `highlight` and `deprecated`

- `deprecated: true` — card still works but is hidden in the editor. When building new flows, prefer non-deprecated alternatives. When auditing existing flows, deprecated cards are not broken but may disappear in future app versions.
- `highlight: true` — Athom or the app developer marked the card as featured. No functional effect; informational only.

## End-to-end worked example

Goal: build an advanced-flow action card that plays a specific Sonos playlist when triggered.

### Step 1 — locate the card

```bash
homey api flow get-flow-card-actions --json \
  --jq '.[] | select(.ownerUri | startswith("homey:app:com.sonos")) | select(.title | test("play"; "i")) | {id, title, args}'
```

Suppose this returns:

```json
{
  "id": "homey:app:com.sonos:play_playlist",
  "title": "Speel afspeellijst",
  "args": [
    { "name": "playlist", "type": "autocomplete", "title": "Afspeellijst" },
    { "name": "device",   "type": "device" }
  ]
}
```

### Step 2 — resolve the `device` arg

```bash
homey api devices get-devices --json \
  --jq 'to_entries[] | select(.value.driverId | startswith("com.sonos")) | {id: .key, name: .value.name}'
```

Pick the right Sonos speaker's id, e.g. `f9a0286c-9fb4-42d3-a425-7f80e2a28de3`.

### Step 3 — resolve the `playlist` autocomplete arg

```bash
homey api flow get-flow-card-autocomplete \
  --type action --uri 'homey:flowcardaction:homey:app:com.sonos:play_playlist' \
  --id playlist --query "evening" --json
```

Returns autocomplete result objects. Pick one — the whole object becomes the arg value.

### Step 4 — compose the action card JSON

```json
{
  "type": "action",
  "id": "homey:app:com.sonos:play_playlist",
  "x": 600, "y": 200,
  "args": {
    "device":   "f9a0286c-9fb4-42d3-a425-7f80e2a28de3",
    "playlist": { "id": "spotify:playlist:xyz", "name": "Evening Jazz" }
  }
}
```

Drop this card into your flow's `cards` object under a fresh UUID, then link it to upstream cards via their `outputSuccess` / `outputTrue` arrays. Run the 10-point validation checklist from `flow-json-schema.md` before pushing.
