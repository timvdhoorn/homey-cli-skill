# Changelog

Newest on top. Format: `## YYYY-MM-DD`.

## 2026-05-22

### Added
- Extracted skill from `Homey` project into standalone repo at `/Users/timvdhoorn/Devops/Homeycli-skill`. Original location now a symlink.
- `references/flow-json-schema.md`: canvas-coordinate calibration — card-type widths differ, so equal x-spacing breaks editor layout. Documented variable offsets per card-type pair with a worked example.
- `references/pitfalls.md`: new section "Self-resetting relays — pulse with `:on`, not `:on` + `:off`" covering Shelly socket / impulse-relay behavior (auto-reset relay, `onoff` mirrors relay not load).

### Changed
- Repo layout: skill content moved from `homey-cli/` subdir to repo root for cleaner GitHub presentation. Symlink from project's `.claude/skills/homey-cli` now points to repo root.
