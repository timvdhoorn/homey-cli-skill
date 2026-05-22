// HomeyScript used as a condition card ("And" / "En").
// The script must resolve to a boolean. Fail-closed (return false) when data is missing.
//
// Replace REPLACE_ME with a device id from `homey api devices get-devices --json`.

const deviceId = 'REPLACE_ME_DEVICE_ID';
const capability = 'measure_temperature';
const threshold = 18;

const device = await Homey.devices.getDevice({ id: deviceId });

if (!device || !device.capabilitiesObj || !device.capabilitiesObj[capability]) {
  log(`condition: ${capability} unavailable on ${deviceId}, returning false`);
  return false;
}

return device.capabilitiesObj[capability].value < threshold;
