// HomeyScript that triggers another flow and passes dynamic tag values.
// Use only when the tag values come from outside Homey (external API, computed result)
// and cannot be produced by a native flow.
//
// Replace REPLACE_ME_FLOW_ID with a flow id from `homey api flow get-flows --json`
// or `homey api flow get-advanced-flows --json`.
//
// The target flow must use a "When this Flow is started programmatically" trigger card
// with matching tag definitions (string / number / boolean / image).

const targetFlowId = 'REPLACE_ME_FLOW_ID';

let label = 'unknown';
let amount = 0;

try {
  const response = await fetch('https://api.example.com/data');
  const data = await response.json();
  label = String(data.label ?? 'unknown');
  amount = Number(data.amount ?? 0);
} catch (err) {
  log(`fetch failed: ${err.message} — using defaults`);
}

await Homey.flow.runFlow({
  id: targetFlowId,
  tokens: { label, amount },
});

return true;
