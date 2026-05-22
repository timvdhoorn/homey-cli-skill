# Wishlist picker — reference

Long-form workflow for Capability 6 in `SKILL.md`. Two modes: browser picker (rich UI via the brainstorming visual companion) and terminal picker (`AskUserQuestion`).

## When to use which mode

| Trigger | Mode |
|---|---|
| User says "browser", "in browser", "show me" | Browser |
| User says "terminal", "quickly", "snel" | Terminal |
| No hint | Ask once via `AskUserQuestion`: *"Browser picker with filters (richer), or terminal (faster)?"* |

No auto-heuristic based on list size — predictability matters more than cleverness.

## Wishlist sources

Look for, in order:

1. `wishlist.json` in cwd — use directly. Schema below.
2. `WISHLIST.md` in cwd — parse with the convention below.
3. Neither present — tell the user, exit.

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

## Mode A — Browser picker

### 1. Normalize the input

Read `wishlist.json` or `WISHLIST.md`. Produce a JSON array matching the schema above.

### 2. Start the visual-companion server

Invoke `Skill(skill: "superpowers:brainstorming")` to load the companion docs. From there, run the launcher described in `visual-companion.md`:

```bash
scripts/start-server.sh --project-dir <cwd>
```

Capture `port`, `url`, `screen_dir`, `state_dir` from the returned JSON.

### 3. Substitute the template

Read `assets/wishlist-picker/template.html` from this skill. Replace `__WISHLIST_DATA__` with the normalized JSON (raw, no surrounding quotes). Write the result to `$SCREEN_DIR/wishlist.html`.

```bash
python3 -c "
import json, pathlib
data = json.loads(pathlib.Path('/tmp/wishlist-input.json').read_text())
tpl = pathlib.Path('<skill-dir>/assets/wishlist-picker/template.html').read_text()
pathlib.Path('$SCREEN_DIR/wishlist.html').write_text(tpl.replace('__WISHLIST_DATA__', json.dumps(data)))
"
```

### 4. Hand off to the user

Tell the user the URL, summarize what they'll see, and ask them to return to the terminal after Submit. End the turn.

### 5. Read the result on the next turn

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

`multiSelect: true`, options are item titles (truncated if needed). `AskUserQuestion` allows up to 4 options per question — for longer wishlists, batch by category, or ask the user to filter first ("only buildable?", "only category X?").

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
| Wishlist file missing | Tell the user, exit. |
| Malformed JSON | Show parse error + line. Suggest validating with `jq .`. |
| Visual-companion server fails to start | Report the error. Offer terminal mode as fallback. |
| User closes browser without Submit | No `submit` event in `$STATE_DIR/events`. Ask whether to retry or switch to terminal. |
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
