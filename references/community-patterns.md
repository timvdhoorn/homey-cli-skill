# Community patterns

Recurring advanced-flow patterns observed in the Homey community (`#advancedflow` tag on community.homey.app). Each entry: what it looks like, the standard way the community solves it, and pointers into this skill.

Sources are real threads — IDs given so the assistant can fetch fresh discussion if needed.

## Contents

- [Companion apps the community relies on](#companion-apps-the-community-relies-on)
- [Flow Exchanger format — gzip+base64 bundle](#flow-exchanger-format--gzipbase64-bundle)
- [Pattern: house-modes state machine (Day / Evening / Night / Away / Vacation)](#pattern-house-modes-state-machine-day--evening--night--away--vacation)
- [Pattern: motion + sun-window light](#pattern-motion--sun-window-light)
- [Pattern: cancellable turn-off timer](#pattern-cancellable-turn-off-timer)
- [Pattern: smoke / alarm escalation](#pattern-smoke--alarm-escalation)
- [Pattern: power-by-the-hour cheap-window switch](#pattern-power-by-the-hour-cheap-window-switch)
- [Pattern: surplus / dynamic-tariff load shifting (EV, heat pump, dishwasher)](#pattern-surplus--dynamic-tariff-load-shifting-ev-heat-pump-dishwasher)
- [Pattern: voice-assistant ↔ advanced-flow bridge](#pattern-voice-assistant--advanced-flow-bridge)
- [Pattern: calendar / iCal-driven flows (holidays, school days, away)](#pattern-calendar--ical-driven-flows-holidays-school-days-away)
- [Pattern: appliance state from power-threshold + sustain window](#pattern-appliance-state-from-power-threshold--sustain-window)
- [Pattern: RF / IR bridge via Broadlink or Tuya gateway](#pattern-rf--ir-bridge-via-broadlink-or-tuya-gateway)
- [Pattern: read HTTP JSON into multiple tags](#pattern-read-http-json-into-multiple-tags)
- [Pattern: long-press dim with steps](#pattern-long-press-dim-with-steps)
- [Pattern: check "are any lamps still on" before leaving](#pattern-check-are-any-lamps-still-on-before-leaving)
- [Pattern: shared event bus via Advanced Triggers](#pattern-shared-event-bus-via-advanced-triggers)
- [Pattern: door / contact OR sensor with auto-off](#pattern-door--contact-or-sensor-with-auto-off)
- [Pattern: centralised notification pipeline (Simple Log)](#pattern-centralised-notification-pipeline-simple-log)
- [Audit-before-refactor: who references this device?](#audit-before-refactor-who-references-this-device)

## Companion apps the community relies on

A handful of third-party apps come up constantly in advanced-flow recipes. Detect their presence with `homey api apps get-apps` before suggesting a pattern that depends on them — and offer the native fallback if they are missing.

| App id | Why it's used | Native fallback |
|---|---|---|
| `com.arpitect.devicecapabilities` ("Device Capabilities") | Math, JSON parse, advanced virtual devices, **and the Flow Exchanger import/export**. Maintained by `Arie_J_Godschalk`. | HomeyScript |
| `nl.qluster-it.AdvancedTriggers` ("Advanced Triggers") | User-defined trigger / action cards keyed by an `eventname` string + arguments. Lets one flow fire many listeners and pass tags. | `Start a flow` action + Logic variables |
| `com.arjankranenburg.chronograph` ("Chronograph") | Named, cancellable timers and transitions (step-based ramps for dim). | `delay` card (not cancellable) |
| `nl.nielsdeklerk.log` ("Simple (Sys) Log") | Centralised timeline with severity tags — wire all notifications through one place. | `homey:manager:mobile push_text` per flow |
| `com.gruijter.powerhour` ("Power by the Hour") | Dynamic-tariff price card + spot-price triggers ("cheapest hour in next N", "this is the most expensive hour"). | Hardcoded time triggers (go stale daily) |
| `com.svendebr.icalcalendar` ("IcalCalendar") | Subscribe to .ics feeds (school holidays, garbage collection, birthdays); trigger on event start/end with the event title as a tag. | HomeyScript date-array lookup (annual maintenance) |
| `com.fellonia.heimdall` ("Heimdall") | Full alarm-system state machine — armed / disarmed / partially armed, with delays and triggers per zone. | Logic boolean per zone + nested conditions |

When the user pastes a flow that uses an unknown card with one of these `ownerUri`s, look the card up via `homey api flow get-flow-card-actions --json --jq '.[] | select(.ownerUri == "homey:app:<id>")'` before suggesting an edit.

## Flow Exchanger format — gzip+base64 bundle

The de-facto community sharing format. Strings look like:

```
H4sIAAAAAAACA9VYa2/bNhT9K4S+2EZNl6KeVJANQZeueyZIMgxDHAx8x…
```

- `H4sIAAAA` is the base64 representation of the gzip magic bytes (`1f 8b`).
- Decompressed payload is JSON with `u` (users) and `a` (advanced flows) keys — a compacted form of advanced-flow JSON: `i`/`n`/`e`/`c` for id/name/enabled/cards, and inside each card `x`/`y`/`o`/`i`/`t`/`a` for position/owner/id/type/args.
- Produced and consumed by the **Device Capabilities** app's Flow Exchanger setting page. The user pastes the string into the app settings — Homey rebuilds the flow.

Round-trip recipe:

```bash
# Decode an exchanger string the user pasted
node -e 'const z=require("zlib"); process.stdout.write(z.gunzipSync(Buffer.from(process.argv[1],"base64")).toString())' "<H4sI…string>"

# Encode an exported advanced-flow JSON for sharing
node -e 'const z=require("zlib"); process.stdout.write(z.gzipSync(require("fs").readFileSync(0)).toString("base64"))' < /tmp/flow.json
```

When the user posts a Flow Exchanger string, decode first, then translate the compacted keys back to the full advanced-flow schema (`flow-json-schema.md`) before pushing via `create-advanced-flow`. The exchanger schema is **not** what `homey api flow create-advanced-flow` accepts directly.

Source: [The Flow Exchange(r) — community.homey.app/t/68981](https://community.homey.app/t/the-flow-exchange-r-exchange-your-flows-with-others/68981).

## Pattern: house-modes state machine (Day / Evening / Night / Away / Vacation)

The foundational pattern almost every multi-flow Homey setup eventually grows. Hold the "current mode" as **one** piece of state, and write every behavioural flow against it. Two valid storage choices — pick one and stick with it:

1. **Logic Text variable** `house_mode` ∈ `day | evening | night | away | vacation`. Easy to compare with `variable_text_is`. Triggerable via `variable_text_changed`. Wins on: testability, observable in Insights, scriptable.
2. **Homey Moods**. Native, applies a scene on set, integrates with the Mood card. Loses on: `set_mood` doesn't emit a "mood changed" trigger event, so you still need a Logic variable mirroring it if you want flows to react to mode changes.

The architecture is two-layer:

```
[time / motion / button / presence triggers]
        |
        v
[set house_mode = X]     ← "mode setters", one flow per mode entry
        |
        v (variable_text_changed)
[fan-out flows]          ← "mode reactors", one or many per mode
```

Mode-setter examples: `at sunset → mode=evening`, `at 23:00 → mode=night`, `everyone left + no presence for 10min → mode=away`, `vacation-mode button on dashboard → mode=vacation`.

Mode-reactor examples per `mode==night`: dim hall lights to 20%, disable doorbell push, arm Heimdall partial, set thermostat to night profile.

**Avoid** spreading mode logic across condition cards in every behaviour flow ("if it's after 23:00 and motion sensors are quiet AND nobody is home"). That replicates the same logic everywhere and gets out of sync. The mode-setter / mode-reactor split is the refactor target.

Source: [setting-up-modes-day-evening-night-away-vacation-in-homey/125351](https://community.homey.app/t/setting-up-modes-day-evening-night-away-vacation-in-homey/125351).

Worked example: `assets/flow-templates/examples/house-modes.json`.

## Pattern: motion + sun-window light

Most-asked beginner question. Intent: "turn the light on if motion is detected **and** it's within the hour before sunset" (or between sunset and sunrise).

**Wrong (the classic mistake):** put a sunset-offset card as the **trigger** (`When: the sun sets in 60 minutes`). That trigger fires once at `sunset - 60min` regardless of motion. Pairing it with an AND on motion makes the flow do nothing 99% of the time.

**Right:** trigger on **motion**, then put the time-window as a **condition**.

```
[trigger: motion sensor → alarm_motion_true]
        |
        v
[condition: time is between (sunset - 60m) and sunrise]
        |
        +-- outputTrue → [action: turn light on]
```

Card IDs:
- Trigger: `homey:device:<sensor>` with capability `alarm_motion`, value `true`.
- Condition: `homey:manager:logic` `is_sun_event_between` (args: `sun_event_a: "set"`, `offset_a: -60`, `sun_event_b: "rise"`, `offset_b: 0`).

Worked example: `assets/flow-templates/examples/motion-sun-window-light.json`.

## Pattern: cancellable turn-off timer

Intent: "turn the light on; if no motion for X minutes, turn it off. Any new motion resets the timer."

The `delay` card **cannot be cancelled** mid-flight. Once placed, the action downstream will fire regardless of intervening events. This trips beginners constantly (see `homey-delay-and-stop-flow`).

**Right:** use **Chronograph** timers — `start_timer <name>` resets the named timer if it was already running, and `timer_finished` fires when it reaches zero. No retained delay state in the flow.

```
[motion ON]  →  [Chronograph: start_timer "hall-off" 60s]
[Chronograph: timer "hall-off" finished]  →  [action: turn light off]
```

Use one timer name per logical timeout. Don't share names between unrelated flows.

If Chronograph is unavailable: use a Logic boolean (`hall_motion_recent`) set to `true` on motion with a `set unset after N seconds` flag, and an alarm card `hall_motion_recent becomes false`.

Worked example: `assets/flow-templates/examples/cancellable-off-timer.json`.

## Pattern: smoke / alarm escalation

Intent: smoke detector triggers → blink lights red → send push → play TTS → optionally turn off devices that could feed the fire (oven, stove relay) → wait 30s → repeat / escalate.

Community wisdom (from `any-ideas-about-the-smoke-detector-flow`):

1. **Don't read action arguments from the alarming device.** If the smoke detector's battery is dead in 6 months, an action card that pulls `Volume` from that same device's `measure_battery` tag will fail too. Pull arguments from neutral cards (Logic variables, dedicated config flow) instead.
2. **Decouple notifications via Simple Log.** Don't scatter `push_text` cards across every flow — log to a central "alarm" channel with severity, then a single dispatcher flow handles push / TTS / SMS based on severity.
3. **Branch on time of day.** Night escalation (lights to 100% white, loud TTS, partner phone) differs from day escalation (notification only). Use a condition card on `is_night`.

Worked example: `assets/flow-templates/examples/smoke-detector-escalation.json`.

## Pattern: power-by-the-hour cheap-window switch

Intent: turn on a flexible load (washing machine, EV charger, water heater) during the cheapest electricity hour in the next N hours.

Use the `Power by the Hour` app's trigger card *"This is the cheapest hour in the next X hours"* — **don't** try to derive it from a `time` trigger + a logic comparison on the hour-of-day. The price varies per day; hardcoded hours go stale immediately.

Pattern:

```
[trigger: cheapest hour starts (Power-by-the-Hour, X=8h)]
   → [condition: appliance ready & queued] → [action: turn on appliance]
   → [delay 60min] → [action: turn off appliance]
```

For a programmable charging strategy (battery: charge during cheap hours, discharge during expensive), pair with the Solar / battery integration's `forecast_today` token and a HomeyScript calculation node — there is no native arithmetic on token arrays.

Worked example: `assets/flow-templates/examples/cheapest-hour-switch.json`.

## Pattern: surplus / dynamic-tariff load shifting (EV, heat pump, dishwasher)

Generalises the cheapest-hour pattern. Three real-world drivers from the community:

1. **EV charger** (Amina S, OpenEVSE, SmartEVSE, Tesla TWA) — modulate charge current to track surplus solar production from a HomeWizard P1 meter, *or* run only during cheap Tibber hours, *or* both.
2. **Heat pump / pellet stove** — turn on when spot price is in the cheapest N hours **and** outdoor temperature dropped below a threshold; turn off when price exceeds X or indoor temp reached setpoint.
3. **Dishwasher / washing machine / EV** — flexible loads ready to run; pick the cheapest window inside a deadline.

Shared shape:

```
[trigger: Power-by-the-Hour "cheapest hour in next N" OR meter "surplus >= X W"]
   → [condition: device armed (Logic boolean)] → [condition: external gate (temp, SoC, time)]
   → [action: set charge current / start appliance]
[trigger: price expensive / surplus < 0 / target met]
   → [action: stop appliance]
```

Operational rules that recur:

- Always pair the trigger with an **arming** Logic boolean. The cheapest hour will arrive every day; the trigger fires unconditionally. The arming variable says "yes, the appliance is queued to run". Toggle it from a dashboard button or another flow.
- Don't drive the *target setpoint* from the alarming/triggering device (see pitfall in `pitfalls.md`). Use a Logic Number.
- Multi-phase / per-phase load splitting (one charger per phase) is a real production pattern but is dispatched outside Homey by the charger itself — keep it that way.

Companion apps: Power by the Hour (`com.gruijter.powerhour`), HomeWizard P1, Tibber, Easyenergy, Frank Energie. Solar forecast via Solcast (often via Home Assistant bridge for forecast-aware schedules).

Source: [charging-with-the-amina-s-smart-evse-charger/114966](https://community.homey.app/t/charging-with-the-amina-s-smart-evse-charger/114966), [minimizing-cost…heat-pump…/99523](https://community.homey.app/t/minimizing-cost-of-using-the-heat-pump-and-pellet-heater-with-changing-electricity-spot-prices-solar-panel-production-and-outdoor-temperatures/99523).

## Pattern: voice-assistant ↔ advanced-flow bridge

Alexa, Google Assistant, and Siri **cannot see advanced flows directly** — only standard flows that are marked as favorite and exposed to the voice integration. The community-standard workaround:

1. Build the real logic as an **advanced flow**, name it descriptively.
2. Build a **standard flow** wrapper: trigger = "Virtual button pressed" (or any voice-recognised input), action = `Start a flow` → the advanced flow.
3. Mark the wrapper flow as favorite. Re-scan scenes in the Alexa / Google app.

Pitfalls observed:

- **Alexa keeps caching deactivated flows** — disabling a wrapper doesn't make it disappear from Alexa. Delete it, then re-scan.
- **Virtual Device class matters.** Alexa recognises Virtual Devices configured as *light* or *switch*; *button*-class VDs are sometimes ignored. If recognition fails, switch the VD class.
- **Google Routines** can invoke favorite flows too, but only one direction (Google → Homey). Use a virtual switch VD as the trigger surface.

Source: [alexa-kann-keine-advanced-flows-workaround/82946](https://community.homey.app/t/alexa-kann-keine-advanced-flows-workaround/82946).

## Pattern: calendar / iCal-driven flows (holidays, school days, away)

Hardcoded date arrays in HomeyScript become annual maintenance debt. The community's go-to: **IcalCalendar** app. Subscribe to one or more `.ics` URLs:

- Government / national holiday feed
- School holidays (most school sites publish one)
- Garbage collection schedule
- Birthdays from your phone calendar
- "Sick at home" / "WFH" added on the fly to your phone calendar

Triggers exposed:

- "Calendar `<name>` event with subject `<text>` starts"
- "Calendar `<name>` is currently active" (condition)

Pattern: a single `is_active` condition card gates whole categories of flows ("if vacation: skip wake-up alarms"). Adding a one-off ("dad off sick today") is a calendar entry on your phone, not a flow edit.

Anti-pattern: HomeyScript array of date strings refreshed once a year. It works but loses every advantage of the calendar (visibility on your phone, shareable, multi-feed).

Source: [holiday-and-vacation-schedules/91407](https://community.homey.app/t/holiday-and-vacation-schedules/91407).

## Pattern: appliance state from power-threshold + sustain window

Dishwasher / washing machine / kettle "done" detection from a smart plug's `measure_power`:

```
[trigger: measure_power changed]
   → [condition: power < 5W FOR 3 minutes] → [notify "done"]
```

The **sustain window** matters — without it, brief drops during a cycle (rinse pause, drying step) trigger false "done" notifications. The community pattern uses Chronograph (`start_timer` on entering low-power, `stop_timer` if power spikes back up; the timer's `timer_finished` is the real "done" event). The native delay can be used but suffers the cancellability pitfall and dies if Homey reboots mid-delay.

Threshold tuning: standby varies per device (smart panel can pull 5-15W idle). Measure your appliance once with the device idle, set the threshold a few watts above that.

Source: [vaatwasser-flow/92724](https://community.homey.app/t/vaatwasser-flow/92724).

## Pattern: RF / IR bridge via Broadlink or Tuya gateway

Homey Pro (Early 2023) **cannot record arbitrary 433MHz signals**. Recurring asks for "copy this remote's button" hit this wall. Workarounds:

1. **Broadlink RM (RF/IR)** via IFTTT webrequest — Homey fires an IFTTT trigger, IFTTT fires Broadlink. Cloud round-trip, but free tier covers 3 webhooks.
2. **Tuya RF/IR Gateway** + "Tap to Run" routine — Homey virtual button triggers a Homey → Tuya integration, which runs the Tap-to-Run. Local-ish.
3. **Older Homey 2019** kept around as an RF transceiver, controlled from the 2023 via "Start a flow on other Homey" — technically works, ugly stack.

If the user only needs a one-way RF command (e.g. a roller-blind remote), recommend the original 433MHz device be replaced with a Z-Wave / Zigbee / Wi-Fi equivalent — long-term cheaper than maintaining a bridge.

Source: [copy-433mhz-signal/70721](https://community.homey.app/t/copy-433mhz-signal/70721).

## Pattern: read HTTP JSON into multiple tags

The HTTP request action returns a single string body. To extract N values you need N follow-up cards:

```
[HTTP GET → "body" tag]
   ↓
[Logic: read "body" as JSON, select path ".data.electric_power[1]" → tag energyPower]
[Logic: read "body" as JSON, select path ".data.gas[1]"            → tag energyGas]
[Logic: read "body" as JSON, select path ".totals.t1[1]"            → tag tariffT1]
```

JSONPath caveats:

- Arrays use `[N]` (zero-indexed). `[timestamp, value]` pairs are common in energy meter APIs — `[1]` picks the value, `[0]` the timestamp.
- Booleans round-trip as strings via the Logic card — convert in the receiving card if needed.
- Long nested responses: write the body to a temporary text variable first if you need to debug paths (then you can inspect via the Insights tab).

For complex transforms (compute averages, pick max of an array), drop into HomeyScript and pass the result back as a tag — `references/homeyscript.md` covers the script-card variants.

Source: [how-do-i-save-multiple-json-objects-from-an-array-to-multiple-tags/68404](https://community.homey.app/t/how-do-i-save-multiple-json-objects-from-an-array-to-multiple-tags/68404).

## Pattern: long-press dim with steps

Intent: button held → light dims continuously while held → stop on release.

Two working approaches:

1. **Chronograph transitions** — `start_transition <name>` with steps and duration, then a flow per "transition reached step N" → dim to that value. Recommended: 30 steps over 10 seconds gives smooth perceptual dimming.
2. **Loop via Advanced Triggers** — fire a custom event, the handler dims by 5%, fires the event again if button still held. Slower but doesn't need Chronograph.

Don't try this with the native `delay` card in a self-loop — the editor accepts it but the runtime forbids cycles on the same flow.

Source: [advanced-flow-long-press-button-dimmer-any-ideas/67450](https://community.homey.app/t/advanced-flow-long-press-button-dimmer-any-ideas/67450).

## Pattern: check "are any lamps still on" before leaving

Intent: when the house alarm activates, scan all lamps in selected zones and either turn them off or warn.

Native cards can only check **one** device at a time. Two clean ways:

1. **HomeyScript condition card** — script iterates zones, returns `true` if any matching device has `onoff: true`. The `return true|false` flows into the condition's `outputTrue`/`outputFalse`.
2. **Device Capabilities virtual device** — define a "Lights On Counter" virtual device that aggregates `onoff` of N targets into a number capability; use a native condition `is greater than 0`.

For "turn them all off", the same idea — script with `device.setCapabilityValue('onoff', false)` per match. See `assets/homeyscript-templates/condition.js` as a starting point.

Source: [advanced-flow-controleren-of-er-nog-lampen-aan-staan/65274](https://community.homey.app/t/advanced-flow-controleren-of-er-nog-lampen-aan-staan/65274).

## Pattern: shared event bus via Advanced Triggers

The **Advanced Triggers** app turns Homey into a tiny event bus: one flow publishes `eventname: "lights_off_all"` with optional tags; many subscriber flows listen for that eventname and fan out. Solves three real limits:

- A single flow can have only one `start` card. Need >1 entry point? Publish from each, subscribe to one bus event.
- The `start a flow` action card hides the dependency in the target flow's JSON. Eventname-based pubsub keeps each side independent.
- Tags travel with the event — useful for "alarm_triggered" + `zone` + `severity`.

Naming convention from community: `verb_noun_scope` ("`light_off_zone`", "`presence_changed_home`"). Keep names short, lowercase, snake_case — they appear in every dropdown.

Source: [Advanced Triggers / 65651](https://community.homey.app/t/app-pro-advanced-triggers-trigger-and-action-cards-with-eventname-for-advanced-flows/65651).

## Pattern: door / contact OR sensor with auto-off

Intent: two doors share a hallway light. Light turns on if **any** door opens; turns off N seconds after **both** are closed (not after either closes — the classic bug).

Common wrong shape: each door's `contact_alarm becomes false` triggers a `delay 60s → light off`. Closing the inner door turns off the light while the outer door is still open.

**Right:**

```
[trigger A: outer door contact changed]
[trigger B: inner door contact changed]
        |
        v
[any]   →  [condition: outer is CLOSED AND inner is CLOSED]
                |
                +-- outputTrue → [Chronograph start_timer 60s "hall-off"]
                +-- outputFalse → [Chronograph stop_timer "hall-off"]
[Chronograph: timer "hall-off" finished] → [light off]
```

The `condition` evaluates both contacts every time either changes. Chronograph ensures the timer resets / cancels cleanly when the state oscillates.

Source: [advanced-flow-2-deuren-en-lamp-en-flow-60-minuten-voor-zon-ondergaat/66648](https://community.homey.app/t/advanced-flow-2-deuren-en-lamp-en-flow-60-minuten-voor-zon-ondergaat/66648).

## Pattern: centralised notification pipeline (Simple Log)

Don't sprinkle `push_text`, `say_text`, and `send_email` across every flow. Pattern from the community:

1. Every flow that wants to notify calls one shared "notify" entry — either via `Start a flow` action or via Advanced Triggers eventname `notify` with tags `severity` (`info|warn|crit`), `message`, `group` (`alarm|energy|presence|…`).
2. A single dispatcher flow subscribes to that bus, checks severity + quiet-hours, and decides which channels to fire (push, TTS, mobile push, mood change).
3. Every event is also written to Simple Log so the timeline is searchable later.

The benefit lands when you want to silence notifications during a movie or on holiday — flip one variable in the dispatcher, not 40 flows.

Source: `homey-smoke-detector` reply chain, esp. the "Simple Log" recommendation.

## Audit-before-refactor: who references this device?

Before deleting a device, removing a zone, or renaming an app, find every flow that mentions it. Native Homey shows no cross-references — you only see breakage after.

Two ways:

1. **HomeyScript audit** — Arie_J_Godschalk's "Find Any Items" script iterates all flows and matches device / zone / app / variable IDs. Returns a list. Already included in the Device Capabilities app as an action card.
2. **CLI snapshot grep** — `homey api flow get-advanced-flows --json | jq '. | tostring | scan("homey:device:<id>")'` plus the same for standard flows. Cheap and offline-capable.

Run this as step 0 of any "I want to replace device X" or "I'm reorganising my zones" work.

Source: [a-homey-script-to-find-any-items.../69904](https://community.homey.app/t/a-homey-script-to-find-any-items-devices-zones-apps-variables-in-any-flow/69904).

---

When you spot a new recurring pattern, add it here. Keep entries grouped by intent ("user wants X") rather than by app — the assistant searches by goal, not by tooling.
