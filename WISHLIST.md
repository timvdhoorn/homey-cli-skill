# Wishlist

Improvement ideas for the `homey-cli` skill. Picker convention: `## Category` headers, `- **Title** — description` items. The wishlist picker (`Capability 6` in `SKILL.md`) can read this file directly.

Submit a PR or open an issue if you want to pick one up.

## Coverage

- **Popular-app worked examples** — Discovery → card spec → flow JSON for Hue, Sonos, tado°, Tesla, KNMI, HomeWizard.
- **Bulk migrate standard → advanced flows** — Recipe for converting many flows at once.
- **Webhook trigger end-to-end** — `homey:manager:webhooks` worked example.
- **Energy automation building block** — P1 meter + dynamic tariff + solar surplus as a reusable pattern.
- **HomeyScript ↔ Flow cookbook** — Logic tags, timers, persistent variables across the boundary.

## Robustness

- **Active-Homey pre-flight script** — Warn when the active Homey differs from a project-pinned ID.
- **`broken: false` lint script** — Resolve every device/zone/flow ref in a flow JSON, report dangling refs.
- **Snapshot/diff workflow** — Export all flows, commit, diff after changes.

## Tooling

- **Shell completions for `homey api`** — Argument-name completions per manager/op.
- **Auto-jq wrapper** — Inject `--json --jq` defaults for read calls.
- **Round-trip flow sandbox** — Runnable `pnpm test:flows` that create → fetch → diff → delete on a sandbox Homey.

## Documentation

- **Standard vs. advanced vs. HomeyScript decision matrix** — When to use which.
- **Advanced-flow primitives diagram** — Visual of `AND` / `OR` / `Note` / `Delay` / `Start Flow` and how `outputTrue` / `outputFalse` / `outputSuccess` / `outputError` wire them.
- **Migration notes beyond the MCP table** — For users coming from the deprecated public Homey MCP.
- **Companion-app card cheatsheets** — Device Capabilities, Chronograph, Advanced Triggers, Simple Log: top 5 cards each with arg shapes. Currently mentioned in `community-patterns.md` but not enumerated.
- **Flow Exchanger import tool** — Reusable script that decodes `H4sIAAAA…` strings into `create-advanced-flow`-compatible JSON.

---

Ideas welcome. Personal device-specific automation ideas belong in a private repo, not here.
