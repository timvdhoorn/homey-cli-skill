# Pitfalls

Gotchas observed in practice while using the Homey CLI. Read this when troubleshooting unexpected behavior — and skim it before any High-tier operation.

## Contents

- [Active-Homey discipline](#active-homey-discipline)
- [`broken: false` lies about dead refs](#broken-false-lies-about-dead-refs)
- [Interactive prompts hang in agent contexts](#interactive-prompts-hang-in-agent-contexts)
- [`--jq` is CLI-side, not local `jq`](#--jq-is-cli-side-not-local-jq)
- [App `name` can be string or i18n object](#app-name-can-be-string-or-i18n-object)
- [`set-capability-value` primitives need `--request-json`](#set-capability-value-primitives-need---request-json)
- [Active-Homey cache is on-disk](#active-homey-cache-is-on-disk)
- [Token-mode for direct IP access](#token-mode-for-direct-ip-access)
- [Update silently overwrites — always back up](#update-silently-overwrites--always-back-up)
- [Self-resetting relays — pulse with `:on`, not `:on` + `:off`](#self-resetting-relays--pulse-with-on-not-on--off)
- [Risk tiers](#risk-tiers)

## Active-Homey discipline

**The #1 footgun for users with more than one Homey on their account** — rentals, parents' houses, lab units. `homey select` writes the active Homey id to a cache file that persists across terminals and sessions. Any subsequent `homey api …` runs against whatever was last selected.

Failure mode: a script intended for Homey A runs against Homey B because the cache was last set to B in another terminal hours ago. For read ops this is annoying. For write ops (update-flow, delete-device, uninstall-app) this is data loss.

**Rule:** run `homey select current` as the first command of any session and immediately before every Medium- or High-tier operation. Never trust prior selection across the gap between two operations.

To set the active Homey non-interactively:

```bash
homey select --id <HOMEY_ID>     # bare `homey select` is interactive and hangs
homey select current             # verify
```

Anyone sharing the skill: when handing it to a teammate, also share which Homey id is the intended target — the cache is per-machine, not per-account.

## `broken: false` lies about dead refs

A flow can reference a `homey:device:<id>` or `homey:zone:<id>` that no longer exists and still report `broken: false`. Observed first-hand on flows whose trigger zone was deleted and luminance sensor was removed — Homey kept the flow marked healthy. The main automation path silently never fired.

**Implication:** the `broken` flag is a necessary check, not a sufficient one. After every push (and during audits) re-resolve every device/zone reference in the flow's `cards` against live `get-devices` / `get-zones`. See `flow-json-schema.md` for the case study and the jq one-liner.

## Interactive prompts hang in agent contexts

Several CLI subcommands fall back to interactive prompts when required flags are missing. Agent contexts have no stdin, so the process hangs until timeout.

Known interactive entrypoints:

- `homey select` (without `--id` or `--name`)
- `homey login` (the OAuth flow itself launches a browser; the retry path can prompt)
- `homey app run` and `homey app publish` (app-developer commands)

Always pass explicit flags. `homey select --id <id>` is the workaround for `homey select`.

## `--jq` is CLI-side, not local `jq`

The `--jq` flag invokes the Homey CLI's bundled jq, not the user's local `jq`. Behavior is *almost* identical but errors surface with the prefix `"jq failed:"` and some less-common operators may differ in version. If a `--jq` expression fails mysteriously, drop `--jq`, output `--json`, and pipe to local `jq` to compare.

A common failure: assuming the output supports `.value.name.en` when the field is actually a plain string in some apps and an i18n object in others — see next pitfall.

## App `name` can be string or i18n object

`homey api apps get-apps` returns each app's `name` as either:

- A plain string: `"Sonos (LocalAPI)"`
- An i18n object: `{"en": "Sonos", "nl": "Sonos"}`

The distinction depends on how the app's manifest is structured. Safe pattern:

```bash
homey api apps get-apps --json \
  --jq 'to_entries | map({
    id: .key,
    name: (if .value.name | type == "object" then (.value.name.en // .value.name.nl) else .value.name end)
  })'
```

## `set-capability-value` primitives need `--request-json`

When the body is a primitive (`true`, `false`, `0.5`), pass `--request-json` so it's sent as a JSON value rather than a literal string.

```bash
# Correct
homey api devices set-capability-value --device-id <id> --capability-id onoff \
  --body 'true' --request-json

# Wrong — sends the string "true", which Homey rejects as a boolean capability
homey api devices set-capability-value --device-id <id> --capability-id onoff \
  --body 'true'
```

For object bodies (`{"key":"value"}`) the default is already JSON, so `--request-json` is redundant but harmless.

## Active-Homey cache is on-disk

The active Homey id lives in a per-machine cache directory (managed by the `homey` binary). Implications:

- Selection persists across terminals and shells on the same machine.
- Selection does **not** transfer to another machine — fresh machine needs `homey login` + `homey select --id` again.
- CI / containers need to either ship the cache or `homey select --id` in their bootstrap step.
- Multi-user machines share the cache per user account (since it's user-scoped).

## Token-mode for direct IP access

`homey api … --token <bearer> --address http://<homey-ip>` bypasses cloud resolution and hits the Homey directly. Useful when:

- The cloud is slow or down.
- Operating from inside the home network without internet.
- Using a guest token (non-owner access).

The bearer token comes from `homey api sessions create-session` or from the Homey developer tools.

## Update silently overwrites — always back up

`update-flow` and `update-advanced-flow` replace the entire flow body — they are PUT, not PATCH. Sending an object missing a field deletes that field. A typo in the `name` field renames the flow.

**Always back up first** for any write operation that takes a `--body`:

```bash
BACKUP="/tmp/homey-backup-$(date +%s).json"
homey api flow get-advanced-flow --id <id> --json > "$BACKUP"
# … then update …
```

For destructive ops (`delete-*`), the backup is the only way back if the user reconsiders.

## Self-resetting relays — pulse with `:on`, not `:on` + `:off`

Some devices (notably **Shelly** sockets and most garage-door / impulse relays) auto-reset their relay after a configured hold time. Their `onoff` capability mirrors the relay state, **not** the downstream load's state. Two consequences when scripting them in flows:

1. **A single `:on` action is enough for a pulse.** Don't pair it with a delayed `:off` — the relay will already have dropped on its own, and the explicit `:off` either no-ops or fights the device. Multiple `:on` actions in a row (with `delay` cards between) reproduce the physical button-press pattern cleanly — e.g. a garage "package mode": `:on → delay 10s → :on → delay 2min → :on` (open half / hold / close).
2. **`onoff` gives no feedback about the load.** A garage motor that fails to move still reports `onoff: false` once the relay drops. Don't condition follow-up logic on the device's capability state; if you need real position feedback, use a separate door / contact sensor.

Worked example: `flows/garagedeur-pakketmodus.md` (in this project's repo) chains three `:on` actions on a Shelly socket without any `:off` and works reliably.

## Risk tiers

The full Safe / Medium / High table with required steps lives in `SKILL.md` under the "Risk tiers" heading. Treat it as the single source of truth.

When in doubt, treat the operation as one tier higher than feels intuitive. Smart-home state is hard to roll back — every device that depends on a flow inherits that flow's correctness.
