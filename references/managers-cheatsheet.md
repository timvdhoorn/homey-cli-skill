# Managers Cheatsheet

`homey api` exposes the Homey local API as ~50 managers. Each manager has its own `schema` command for live introspection — this cheatsheet covers the commonly-used ones with their top operations.

To list every manager: `homey api --help`.
To list every op for a manager: `homey api <manager> --help`.
To dump a manager's full schema: `homey api <manager> schema`.

## Contents

- [flow — flows + flow cards](#flow--flows--flow-cards)
- [devices — devices, capabilities, settings](#devices--devices-capabilities-settings)
- [zones — room hierarchy](#zones--room-hierarchy)
- [apps — installed apps](#apps--installed-apps)
- [moods — light scenes](#moods--light-scenes)
- [logic — variables](#logic--variables)
- [insights — historical data](#insights--historical-data)
- [notifications — push messages](#notifications--push-messages)
- [energy — live power data](#energy--live-power-data)
- [system — host info](#system--host-info)
- [users — household members](#users--household-members)
- [presence — who is home](#presence--who-is-home)
- [geolocation — home location](#geolocation--home-location)
- [Radio managers — zigbee / zwave / matter / ble / thread](#radio-managers--zigbee--zwave--matter--ble--thread)
- [raw — escape hatch](#raw--escape-hatch)
- [Long tail](#long-tail)

## flow — flows + flow cards

Manage flows (standard + advanced), folders, and flow card definitions. Full detail in `flow-cards.md` and `flow-json-schema.md`.

```bash
homey api flow get-flows --json                       # list standard flows
homey api flow get-advanced-flows --json              # list advanced flows
homey api flow get-flow --id <id> --json              # one standard flow
homey api flow get-advanced-flow --id <id> --json     # one advanced flow
homey api flow get-flow-card-triggers --json          # all trigger card defs
homey api flow get-flow-card-conditions --json        # all condition card defs
homey api flow get-flow-card-actions --json           # all action card defs
homey api flow trigger-flow --id <id>                 # run a standard flow
homey api flow trigger-advanced-flow --id <id>        # run an advanced flow
homey api flow create-flow --body @file.json
homey api flow create-advanced-flow --body @file.json
homey api flow update-flow --id <id> --body @file.json
homey api flow update-advanced-flow --id <id> --body @file.json
homey api flow delete-flow --id <id>
homey api flow delete-advanced-flow --id <id>
homey api flow get-flow-folders --json                # folder structure
```

## devices — devices, capabilities, settings

Devices, their capabilities (state), per-device app-specific settings.

```bash
homey api devices get-devices --json                  # all devices
homey api devices get-device --id <id> --json         # one device, full state
homey api devices get-device-settings-obj --id <id> --json
homey api devices set-device-settings --id <id> --body '{"<key>":<value>}'
homey api devices set-capability-value \
  --device-id <id> --capability-id onoff --body 'true' --request-json
homey api devices update-device --id <id> --body '{"name":"...","zone":"<zone-id>"}'
homey api devices delete-device --id <id>
```

## zones — room hierarchy

Zones form a tree: a root zone (usually "Home") with nested rooms.

```bash
homey api zones get-zones --json                      # all zones (flat with parent refs)
homey api zones get-zone --id <id> --json
homey api zones create-zone --body '{"name":"...","parent":"<parent-id>"}'
homey api zones update-zone --id <id> --body '{"name":"..."}'
homey api zones delete-zone --id <id>
```

## apps — installed apps

```bash
homey api apps get-apps --json                        # all installed apps
homey api apps get-app --id <app-id> --json
homey api apps get-app-settings --id <app-id> --json  # the app's user settings
homey api apps get-app-setting --id <app-id> --name <name> --json
homey api apps set-app-setting --id <app-id> --name <name> --body '<value>'
homey api apps enable-app --id <app-id>
homey api apps disable-app --id <app-id>
homey api apps restart-app --id <app-id>
homey api apps install-from-app-store --body '{"id":"<app-id>"}'
homey api apps uninstall-app --id <app-id>
```

## moods — light scenes

```bash
homey api moods get-moods --json
homey api moods get-mood --id <id> --json
homey api moods set-mood --id <id>                    # activate a scene
homey api moods create-mood --body '{"name":"...","devices":{...}}'
homey api moods delete-mood --id <id>
```

## logic — variables

Persistent variables usable in flows as tokens.

```bash
homey api logic get-variables --json
homey api logic create-variable --body '{"name":"...","type":"number","value":0}'
homey api logic update-variable --id <id> --body '{"value":42}'
homey api logic delete-variable --id <id>
```

`type` is `boolean | number | string`.

## insights — historical data

Time-series for every capability and for some app metrics.

```bash
homey api insights get-logs --json                    # all log streams
homey api insights get-log --uri <uri> --id <id> --json
homey api insights get-log-entries \
  --uri <uri> --id <id> --resolution last24Hours --json
```

`resolution` examples: `lastHour`, `last6Hours`, `last24Hours`, `last7Days`, `last31Days`, `last2Years`.

## notifications — push messages

```bash
homey api notifications get-notifications --json      # past push history
homey api notifications create-notification \
  --body '{"excerpt":"Hello from CLI"}'
```

## energy — live power data

```bash
homey api energy get-live-report --json
homey api energy get-yearly-report --json
```

## system — host info

```bash
homey api system get-info --json                      # hostname, software, hardware
homey api system get-storage --json                   # disk usage
homey api system get-memory --json
homey api system restart                              # reboot Homey (HIGH risk)
```

## users — household members

```bash
homey api users get-users --json                      # household + Athom IDs
homey api users get-user --id <id> --json
homey api users get-user-me --json                    # the logged-in account
```

## presence — who is home

```bash
homey api presence get-presence-state --json          # everyone's presence
```

## geolocation — home location

```bash
homey api geolocation get-geolocation --json          # lat/long, accuracy
```

## Radio managers — zigbee / zwave / matter / ble / thread

Each radio has its own manager for inspecting the network, devices, mesh state, and pairing.

```bash
homey api zigbee --help     # list zigbee ops
homey api zwave  --help     # list zwave ops
homey api matter --help
homey api ble    --help
homey api thread --help
```

Common patterns:

```bash
homey api zigbee get-state --json
homey api zwave  get-state --json
homey api matter get-nodes --json
```

For deep inspection use `<manager> schema` to discover all ops.

## raw — escape hatch

When a manager doesn't expose what you need:

```bash
homey api raw --path /api/manager/<manager>/<endpoint> --json
homey api raw -X POST --path /api/manager/<m>/<e> --body '{"key":"value"}'
homey api raw -X PUT  --path /api/manager/<m>/<e>/<id> --body @file.json
```

Flags: `--include` for headers, `--verbose` to debug, `--token --address` for token mode.

## Long tail

These managers are also available — use `homey api <name> --help` to explore:

`alarms`, `api`, `arp`, `backup`, `clock`, `cloud`, `coprocessor`, `cron`, `dashboards`, `database`, `devkit`, `discovery`, `drivers`, `energydongle`, `experiments`, `flowtoken`, `google-assistant`, `i18n`, `icons`, `images`, `ledring`, `mobile`, `rf`, `safety`, `satellites`, `security`, `sessions`, `updates`, `vdevice`, `videos`, `weather`, `webserver`.

Most are read-only state inspectors or developer-oriented. The frequently useful ones in the long tail:

- `alarms` — programmable alarms (`get-alarms`, `create-alarm`).
- `cloud` — cloud connection state.
- `backup` — request a backup snapshot.
- `weather` — current weather + forecast token sources.
- `mobile` — push notification configuration (used by mobile push flow actions).
- `updates` — firmware update state.
