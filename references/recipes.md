# Recipes

Ready-to-paste shell snippets for common operations. Each is self-contained, uses `--json --jq` to keep output small, and writes large dumps to `/tmp` instead of dumping into chat context.

## Contents

- [Backup](#backup)
- [Audit](#audit)
- [Bulk operations](#bulk-operations)
- [Search](#search)
- [Discovery shortcuts](#discovery-shortcuts)

## Backup

### Full snapshot to a timestamped dir

Use before any High-tier mutation, or as a periodic safety net.

```bash
DIR="/tmp/homey-backup-$(date +%Y%m%d-%H%M%S)" && mkdir -p "$DIR"
homey api flow get-flows           --json > "$DIR/flows-standard.json"
homey api flow get-advanced-flows  --json > "$DIR/flows-advanced.json"
homey api flow get-flow-folders    --json > "$DIR/flow-folders.json"
homey api devices get-devices      --json > "$DIR/devices.json"
homey api zones get-zones          --json > "$DIR/zones.json"
homey api apps get-apps            --json > "$DIR/apps.json"
homey api moods get-moods          --json > "$DIR/moods.json"
homey api logic get-variables      --json > "$DIR/logic-variables.json"
echo "Backup: $DIR"
```

### Single flow backup before edit

```bash
FLOW_ID="<id>"
BACKUP="/tmp/homey-flow-$FLOW_ID-$(date +%s).json"
homey api flow get-advanced-flow --id "$FLOW_ID" --json > "$BACKUP"
echo "Backup: $BACKUP"
```

### Export every advanced flow into its own file

```bash
DIR="/tmp/homey-advflows-$(date +%Y%m%d-%H%M%S)" && mkdir -p "$DIR"
for id in $(homey api flow get-advanced-flows --json --jq 'keys[]' | tr -d '"'); do
  homey api flow get-advanced-flow --id "$id" --json > "$DIR/$id.json"
done
echo "Exported $(ls "$DIR" | wc -l) advanced flows to $DIR"
```

## Audit

### List flows with dead device or zone refs

`broken: false` does not catch this. Diff the device/zone refs found in card args against live `get-devices` / `get-zones`.

```bash
# 1. live device + zone ids
homey api devices get-devices --json --jq 'keys[]' | tr -d '"' | sort -u > /tmp/live-devices.txt
homey api zones   get-zones   --json --jq 'keys[]' | tr -d '"' | sort -u > /tmp/live-zones.txt

# 2. device/zone refs used in advanced flows
homey api flow get-advanced-flows --json --jq '
  to_entries[] | .key as $flow |
  .value.cards | to_entries[] |
  (.value.ownerUri // empty) as $owner |
  if ($owner | startswith("homey:device:")) then {flow: $flow, ref: $owner} else empty end
' > /tmp/flow-device-refs.json

# 3. cross-reference
jq -r '.ref' /tmp/flow-device-refs.json | sed 's|homey:device:||' | sort -u > /tmp/used-devices.txt
comm -23 /tmp/used-devices.txt /tmp/live-devices.txt
```

### List deprecated card usage

```bash
# Deprecated card definitions
homey api flow get-flow-card-actions --json \
  --jq '.[] | select(.deprecated == true) | .id' > /tmp/deprecated-action-ids.txt

# Cross-reference with cards used in advanced flows
homey api flow get-advanced-flows --json --jq '
  to_entries[] | .key as $flow |
  .value.cards | to_entries[] |
  select(.value.type == "action") |
  {flow: $flow, cardId: .value.id}
'
# Manually compare cardId values against /tmp/deprecated-action-ids.txt
```

### Find disabled flows

```bash
homey api flow get-flows --json \
  --jq 'to_entries | map(select(.value.enabled == false) | {id: .key, name: .value.name})'
homey api flow get-advanced-flows --json \
  --jq 'to_entries | map(select(.value.enabled == false) | {id: .key, name: .value.name})'
```

## Bulk operations

### Disable all flows in a folder

```bash
FOLDER_ID="<folder-id>"
for id in $(homey api flow get-advanced-flows --json \
  --jq --arg f "$FOLDER_ID" 'to_entries[] | select(.value.folder == $f) | .key' | tr -d '"'); do
  echo "Disabling $id"
  CURRENT=$(homey api flow get-advanced-flow --id "$id" --json)
  echo "$CURRENT" | jq '.enabled = false' > "/tmp/disable-$id.json"
  homey api flow update-advanced-flow --id "$id" --body @"/tmp/disable-$id.json"
done
```

### Set a capability on every device of a class

Example: turn off every light.

```bash
for id in $(homey api devices get-devices --json \
  --jq 'to_entries[] | select(.value.class == "light") | .key' | tr -d '"'); do
  homey api devices set-capability-value \
    --device-id "$id" --capability-id onoff --body 'false' --request-json
done
```

### Move every device with a name suffix to a target zone

```bash
SUFFIX="-Kitchen"
ZONE_ID="<kitchen-zone-id>"
for id in $(homey api devices get-devices --json \
  --jq --arg s "$SUFFIX" 'to_entries[] | select(.value.name | endswith($s)) | .key' | tr -d '"'); do
  homey api devices update-device --id "$id" --body "{\"zone\":\"$ZONE_ID\"}"
done
```

## Search

### Find every flow that references a specific device

```bash
DEVICE_ID="<device-id>"
homey api flow get-advanced-flows --json \
  --jq --arg d "$DEVICE_ID" '
    to_entries | map(select(
      .value.cards | to_entries | any(.value.ownerUri == "homey:device:" + $d)
      or (.value | tostring | contains($d))
    )) | map({id: .key, name: .value.name})
  '
```

### Find all devices in a zone (by zone name)

```bash
ZONE_NAME="Kitchen"
homey api devices get-devices --json \
  --jq --arg z "$ZONE_NAME" 'to_entries | map(select(.value.zoneName == $z) | {id: .key, name: .value.name, class: .value.class})'
```

### Find devices missing capabilities (likely offline)

```bash
homey api devices get-devices --json \
  --jq 'to_entries | map(select(.value.available == false) | {id: .key, name: .value.name, zone: .value.zoneName})'
```

### Search flow card definitions

```bash
KEYWORD="play"
homey api flow get-flow-card-actions --json \
  --jq --arg k "$KEYWORD" '.[] | select(.title | test($k; "i")) | {id, title, ownerUri}'
```

## Discovery shortcuts

### List installed apps from a specific vendor

```bash
VENDOR="com.sonos"
homey api apps get-apps --json \
  --jq --arg v "$VENDOR" 'to_entries | map(select(.key | startswith($v)) | {id: .key, name: .value.name, version: .value.version})'
```

### List capabilities for a device

```bash
DEVICE_ID="<id>"
homey api devices get-device --id "$DEVICE_ID" --json \
  --jq '.capabilitiesObj | keys'
```

### Discover all flow card actions provided by one app

```bash
APP="com.sonos"
homey api flow get-flow-card-actions --json \
  --jq --arg a "$APP" '.[] | select(.ownerUri | startswith("homey:app:" + $a)) | {id, title, args}'
```

### Count flow cards per app (which apps contribute the most automation surface)

```bash
homey api flow get-flow-card-actions --json \
  --jq 'group_by(.ownerUri) | map({owner: .[0].ownerUri, count: length}) | sort_by(-.count) | .[0:20]'
```
