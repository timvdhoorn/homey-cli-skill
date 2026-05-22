# Migrating from the public Homey MCP

If you came from `mcp__claude_ai_Homey__*`, this skill replaces it entirely and removes the need for that MCP. Below is the full per-tool mapping, plus the capabilities the skill exposes that the MCP does not.

## Contents

- [Tool-by-tool mapping](#tool-by-tool-mapping)
- [Where this skill exceeds the MCP](#where-this-skill-exceeds-the-mcp)
- [Setup migration](#setup-migration)

## Tool-by-tool mapping

| MCP tool | CLI replacement | Notes |
|---|---|---|
| `list_homeys` | `homey list --json` | Account-wide list |
| `list_zones` | `homey api zones get-zones --json` | Full zone tree |
| `list_devices` | `homey api devices get-devices --json` | Richer than MCP — includes settings, capabilities object |
| `list_flows` | `homey api flow get-flows --json` | Standard flows only — see notes below |
| `list_moods` | `homey api moods get-moods --json` | |
| `list_flow_trigger_cards` | `homey api flow get-flow-card-triggers --json` | |
| `list_flow_condition_cards` | `homey api flow get-flow-card-conditions --json` | |
| `list_flow_action_cards` | `homey api flow get-flow-card-actions --json` | |
| `get_standard_flow` | `homey api flow get-flow --id <id> --json` | |
| `get_advanced_flow` | `homey api flow get-advanced-flow --id <id> --json` | |
| `create_standard_flow` | `homey api flow create-flow --body @flow.json` | See `flow-json-schema.md` for body shape |
| `create_advanced_flow` | `homey api flow create-advanced-flow --body @flow.json` | See `flow-json-schema.md` for body shape (8 card types) |
| `update_standard_flow` | `homey api flow update-flow --id <id> --body @flow.json` | Silently overwrites — back up first |
| `update_advanced_flow` | `homey api flow update-advanced-flow --id <id> --body @flow.json` | Silently overwrites — back up first |
| `start_flow` | `homey api flow trigger-flow --id <id>` or `trigger-advanced-flow --id <id>` | Pick based on flow type |
| `set_mood` | `homey api moods set-mood --id <mood-id>` | |
| `set_devices_capabilities_values` | `homey api devices set-capability-value --device-id <id> --capability-id <cap> --body '<value>' --request-json` | Loop for bulk — see `recipes.md` |
| `move_device_to_zone` | `homey api devices update-device --id <id> --body '{"zone":"<zone-id>"}'` | |
| `rename_device` | `homey api devices update-device --id <id> --body '{"name":"..."}'` | |

### Advanced-flow JSON shape — the MCP's true value-add

The MCP's `create_advanced_flow` / `update_advanced_flow` input schemas implicitly document the 8 card types accepted by the Homey API. This skill carries that schema explicitly in `flow-json-schema.md` — including the gotchas the MCP schema doesn't surface (e.g. "Enkel" maps to `"type": "any"`, `all` / `any` use `<uuid>::<outputName>` input refs, `note` requires `value` + `color`).

### `list_flows` MCP limitation

The MCP's `list_flows` returned only standard flows in observation (empty when only advanced flows existed). The CLI exposes both via separate endpoints: `get-flows` for standard, `get-advanced-flows` for advanced. Use both during inventory.

## Where this skill exceeds the MCP

The MCP covers a focused subset. The CLI is the full local Homey API. Capabilities the MCP does not expose:

- **All ~50 managers** — `homey api --help`. The MCP covers ~6 (flow, devices, zones, apps via card lists, moods).
- **App inventory with versions and origin** — `homey api apps get-apps`. No MCP equivalent.
- **App settings** — read and write per-app settings via `homey api apps get-app-settings` / `set-app-setting`. Required for managing HomeyScript.
- **Device settings** — per-device app-configured settings via `get-device-settings-obj` / `set-device-settings`. The MCP only sets capabilities (state), not settings (config).
- **Logic variables** — `homey api logic` for creating and updating persistent variables used as flow tokens.
- **Insights time series** — `homey api insights` for historical capability data.
- **Energy & solar** — `homey api energy` for live power data.
- **Radio networks** — `homey api zigbee` / `zwave` / `matter` / `ble` / `thread` for mesh and pairing inspection.
- **System info** — `homey api system` for host, storage, memory, restart.
- **Users and presence** — `homey api users` / `presence`.
- **Notifications** — `homey api notifications` for sending push messages and inspecting history.
- **Raw API** — `homey api raw` reaches every endpoint, including ones with no dedicated manager.
- **HomeyScript management** — read/write scripts as `com.athom.homeyscript` app settings (see `homeyscript.md`).

## Setup migration

To stop using the MCP entirely after adopting this skill:

1. Install the CLI: `npm install -g homey` (or `bun add -g homey`).
2. Authenticate: `homey login`.
3. Select your Homey non-interactively: `homey select --id <HOMEY_ID>` (find ids with `homey list --json`).
4. Verify: `homey whoami` and `homey select current`.
5. Disable / uninstall the public Homey MCP from your client configuration. There is no in-flight state — the MCP is stateless on the user side, so removing it has no cleanup cost.

All operations the MCP supported are now reachable via the CLI, with stronger safety rails (active-Homey discipline, backup-before-mutate, the 10-point validation checklist) documented in this skill.
