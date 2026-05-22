# Flow suggestions — reference

Surface flow ideas and let the user pick which to build. The agent generates suggestions from the user's Homey inventory, or browses an existing wishlist file. Selections feed into Capability 3 (flow building).

## When the agent invokes this

Natural triggers — match user intent, not exact phrasing:

- *"suggest flows"* / *"what can I automate"* / *"geef wat ideeën"*
- *"let's prioritize"* / *"wat zou je doen met mijn devices"*
- *"what should I build next?"*
- *"open my wishlist"* / *"browse WISHLIST.md"* — file-based source

After picking a source (see below), choose a display mode — honor explicit hints (*"in browser"*, *"snel"*), otherwise ask once via `AskUserQuestion`:

| Display mode | Best for |
|---|---|
| Browser (rich UI, want / maybe / skip / done, filters) | ≥6 items or thorough triage |
| Terminal (`AskUserQuestion` multiSelect) | ≤6 items or quick passes |

No auto-heuristic based on list size — predictability matters more than cleverness.

## Sources

Three sources, in this order of preference when not explicitly named:

1. **Agent-generated suggestions** — when the user asks for ideas and no file is named. Generate from inventory. See [Generating suggestions](#generating-suggestions).
2. `wishlist.json` in cwd — use directly. Schema below.
3. `WISHLIST.md` in cwd — parse with the convention below.

The user can ask to **combine** sources — e.g. generated suggestions on top of an existing wishlist. Merge into one JSON array; use a `gen-` prefix on generated ids to avoid collisions.

### JSON schema

```json
[
  {
    "id": 1,
    "title": "Solar surplus alert",
    "desc": "measure_feed_in > 1500 W for 5 min → push.",
    "category": "Energy",
    "status": "buildable",
    "devices": ["Zonnepanelen", "P1 Meter"]
  }
]
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Integer or stable string. Must be unique. |
| `title` | yes | One line. |
| `desc` | no | Free text. Rendered as-is. |
| `category` | no | Drives the category dropdown. |
| `status` | no | One of `buildable`, `partial`, `blocked`. Drives status chips + colour. |
| `devices` | no | Array of strings. Rendered as a comma list. |

Unknown fields are ignored.

### Markdown convention

The parser walks the file top to bottom:

- `## <Heading>` sets `category` for subsequent items.
- `- **<Title>** — <description>` or `- **<Title>**: <description>` produces one item. Em-dash and colon are both accepted as separators.
- Indented continuation lines extend `desc`.
- No status / devices in plain markdown — those stay `null`.
- IDs are assigned sequentially in document order, starting at 1.

For richer metadata, write `wishlist.json` instead.

## Generating suggestions

The picker is data-agnostic — it renders whatever JSON the agent feeds it. That makes it a natural surface for agent-generated flow suggestions based on the user's Homey.

### How to generate good suggestions

1. **Pull inventory first.** Read what's actually paired:
   ```bash
   homey api devices get-devices --json --jq 'to_entries | map({id: .key, name: .value.name, zone: .value.zoneName, class: .value.class, capabilities: (.value.capabilities // []) | keys})'
   homey api zones get-zones --json --jq 'to_entries | map({id: .key, name: .value.name})'
   homey api flow get-flows --json --jq 'to_entries | map(.value.name)'
   homey api flow get-advanced-flows --json --jq 'to_entries | map(.value.name)'
   ```
2. **Group devices by class** (lights, sensors, speakers, cameras, energy, locks, etc.). Each class unlocks a known set of automation patterns.
3. **Propose items, one per pattern.** For each, set `status`:
   - `buildable` — every device the flow needs is paired.
   - `partial` — most devices present but one piece missing (note the missing piece in `desc`).
   - `blocked` — required device class not paired at all. Still useful to surface so the user knows what to add.
4. **Skip what already exists.** Cross-check against `get-flows` / `get-advanced-flows` titles before suggesting. Don't propose a "Garage door alert" if one already exists.
5. **Keep titles short, descriptions concrete.** *"Solar surplus alert — `measure_feed_in > 1500 W` for 5 min → push"* beats *"consider notifying when solar produces a lot"*.

### Pattern starter set

A non-exhaustive checklist by device class. Only propose what the user's inventory supports.

| If the user has… | Consider suggesting |
|---|---|
| P1 / energy meter | Solar surplus alert, high-usage-at-night warning, daily energy briefing via Sonos, standby-drain heuristic |
| Smart lights (≥3) | Evening dim ramp, TV mode, wake-up light, presence simulation when away, sunset-on |
| Sonos / speaker | Doorbell auto-pause, night-sound auto-on, doorbell chime via speaker, audio announcements for other triggers |
| Cameras / doorbell | Person-on-driveway-at-night flash + push, package detection, NFC welcome scene, motion-while-armed alert |
| Windowcovering | Sunset-down, high-wind-up (needs weather), high-solar-down |
| Door/window sensor | Open-too-long warning, open-when-away alert |
| Thermostat | Window-open auto-off, away setback, schedule by occupancy |
| Lock | Auto-lock at night, lock-state-on-leave check |
| Heartbeat / monitoring | Camera disconnect alarm, meter-stuck detection, app-disabled warning |

### After submit

The agent's natural next step is to **build the picked flows** (Capability 3): discovery → card spec → JSON → validate → push. Loop one item at a time, confirm with the user before pushing each.

## Mode A — Browser picker

### 1. Normalize the input

Produce a JSON array matching the schema above — whether from `wishlist.json`, parsed `WISHLIST.md`, or freshly generated suggestions.

### 2. Start the visual-companion server

Invoke `Skill(skill: "superpowers:brainstorming")` to load the companion docs, then run the launcher described in `visual-companion.md`:

```bash
scripts/start-server.sh --project-dir <cwd>
```

Capture `port`, `url`, `screen_dir`, `state_dir` from the returned JSON.

### 3. Substitute the template

Read `assets/wishlist-picker/template.html` from this skill. Replace `__WISHLIST_DATA__` with the JSON (raw, no surrounding quotes). Write the result to `$SCREEN_DIR/wishlist.html`.

```bash
python3 -c "
import json, pathlib
data = json.loads(pathlib.Path('/tmp/wishlist-input.json').read_text())
tpl = pathlib.Path('<skill-dir>/assets/wishlist-picker/template.html').read_text()
pathlib.Path('$SCREEN_DIR/wishlist.html').write_text(tpl.replace('__WISHLIST_DATA__', json.dumps(data)))
"
```

### 4. Wait for the submit event (auto-continue)

Tell the user the URL, what to do (*"click priorities, then Submit"*), **and the fallback**: *"if I don't continue automatically after you click Submit, just say 'submitted' (or anything similar) and I'll pick it up."* Then block until the submit event appears — do not end the turn.

Use `Monitor` (or `Bash` with `run_in_background: true`) on this until-loop:

```bash
until grep -q '"type":"submit"' "$STATE_DIR/events" 2>/dev/null; do sleep 2; done
```

The loop exits the moment the submit event is written to disk. The runtime notifies the agent and the next step runs.

If the auto-notify fails (background process not picked up, hook blocked, etc.) the user will tell you they submitted. In that case skip the wait and proceed to step 5.

### 5. Read the result

Read `$STATE_DIR/events` (JSONL). Take the **last** event of `type: "submit"`. Its `selections` field is the result:

```json
{"type":"submit","choice":"submit","selections":{"1":"want","7":"maybe","13":"want"},"timestamp":1706000000}
```

The `choice: "submit"` field is required — the brainstorming server only persists events with a truthy `choice` field (see `server.cjs` line 234), so the template includes this sentinel value on submit events.

If no `submit` event is present, the user did not finish. Ask whether to retry or switch modes.

## Mode B — Terminal picker

### 1. Normalize the input

Same as Mode A.

### 2. Show a compact list in chat

Group by category. One line per item: `#<id> <title> [<status>]`. Plain text — no need to render full descriptions.

### 3. Ask via AskUserQuestion

`multiSelect: true`, options are item titles (truncated if needed). `AskUserQuestion` allows up to 4 options per question — for longer lists, batch by category, or ask the user to filter first (*"only buildable?"*, *"only category X?"*).

### 4. Treat selected items as `choice: "want"`

Terminal mode does not model maybe/skip/done — too clunky in `AskUserQuestion`. Users who want full triage use the browser mode.

## Output to agent

Both modes produce the same internal shape:

```json
{ "selections": [ {"id": 1, "choice": "want"}, {"id": 7, "choice": "maybe"} ] }
```

Items without an explicit choice are omitted. Use the result to ask the user which "want" item to pick up first.

## Failure modes

| Symptom | Fix |
|---|---|
| Source file missing and no inventory access | Tell the user, exit. |
| Malformed JSON | Show parse error + line. Suggest validating with `jq .`. |
| Visual-companion server fails to start | Report the error. Offer terminal mode as fallback. |
| User closes browser without Submit | The `Monitor`/`Bash` until-loop never exits. Set a generous timeout (e.g. 30 min) so the wait can be cancelled and the user can retry or switch to terminal. |
| Multiple `submit` events | Use the last one. Submit is the commit. |
| `priority` events but no `submit` | Treat as no result. Don't reconstruct the final state from `priority` events. |

## Template internals (for reference only)

`assets/wishlist-picker/template.html` is a single self-contained HTML document. Key contract points:

- Starts with `<!doctype html>` → the visual-companion server serves it as-is and only injects `helper.js`.
- The `IDEAS` constant is initialized from `__WISHLIST_DATA__`. Replace this literal string with the raw JSON.
- Each priority button click emits `window.brainstorm.send({ type: "priority", id, choice })`. `choice` is `null` when the user toggled the same button off.
- The Submit button emits `window.brainstorm.send({ type: "submit", choice: "submit", selections: {...} })` then shows the overlay. The `choice: "submit"` sentinel is required because the brainstorming server only persists events with a truthy `choice` field. It is disabled until at least one priority is set.
- After Submit, further priority clicks do not emit events.
- No `localStorage`. Theme and selections reset on reload.
