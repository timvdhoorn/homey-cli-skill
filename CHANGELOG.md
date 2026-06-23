# Changelog

Newest on top. Format: `## YYYY-MM-DD`.

## 2026-06-23

### Changed
- `README.md`: install section now leads with the one-liner `npx skills add timvdhoorn/homey-cli-skill` as the quickest install path; the git clone methods (Options A/B/C) are grouped under a "Manual install (git)" subsection as fallback.

## 2026-05-23

### Added
- `references/community-patterns.md`: new file capturing 13 recurring advanced-flow patterns mined from ~40 high-engagement community threads tagged `#advancedflow`. Covers house-modes state machine, motion+sun-window, cancellable timers (Chronograph), smoke/alarm escalation, cheapest-hour and surplus/dynamic-tariff load shifting, voice-assistant bridge, iCal-driven flows, power-threshold appliance detection, RF/IR bridge via Broadlink/Tuya, JSON-to-tags parsing, long-press dim, "are any lamps still on" check, two-door auto-off, centralised notifications, audit-before-refactor. Includes Flow Exchanger format spec (`H4sIAAAA…` = gzip+base64 of compacted bundle) and a companion-app table (Device Capabilities, Advanced Triggers, Chronograph, Simple Log, Power-by-the-Hour, IcalCalendar, Heimdall).
- `assets/flow-templates/examples/`: 6 lean worked-example flow JSONs — house-modes setter, motion+sun-window light, cancellable off-timer, smoke-detector escalation, cheapest-hour switch, two-door hallway light. All UUIDs valid; arguments marked TODO.
- `references/pitfalls.md`: 10 new gotchas — sun-offset triggers fire once not over a window, `delay` cards can't be cancelled mid-flight, `any`/`all` `input[]` need the `::outputSuccess` suffix, "Enkel" UI = `"type": "any"` JSON, action arguments shouldn't depend on the triggering device, Flow Exchanger schema ≠ `create-advanced-flow` schema, `is_before_sunset`/`is_before_sunrise` are window semantics not earlier-than, `AND`-push confirm cards are fragile on Android, voice assistants only see favorited standard flows, spontaneous firing is usually device-side automation.

### Changed
- `SKILL.md`: references table now includes `community-patterns.md` and `examples/`; "Build/modify a flow" section points to the community pattern library as the first check before designing from scratch.
- `WISHLIST.md`: added two follow-ups surfaced by the analysis — companion-app card cheatsheets and a Flow Exchanger import tool.

## 2026-05-22

### Added
- Extracted skill from `Homey` project into standalone repo at `/Users/timvdhoorn/Devops/Homeycli-skill`. Original location now a symlink.
- `references/flow-json-schema.md`: canvas-coordinate calibration — card-type widths differ, so equal x-spacing breaks editor layout. Documented variable offsets per card-type pair with a worked example.
- `references/pitfalls.md`: new section "Self-resetting relays — pulse with `:on`, not `:on` + `:off`" covering Shelly socket / impulse-relay behavior (auto-reset relay, `onoff` mirrors relay not load).

### Changed
- Repo layout: skill content moved from `homey-cli/` subdir to repo root for cleaner GitHub presentation. Symlink from project's `.claude/skills/homey-cli` now points to repo root.
