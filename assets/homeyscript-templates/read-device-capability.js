// HomeyScript that safely reads a device capability and returns its value.
// Logs a warning and returns null when the device or capability is missing.
// Use as a building block — call sites can treat null as "no data".
//
// Replace REPLACE_ME with a device id from `homey api devices get-devices --json`
// and adjust `capability` to the capability you want to read.

const deviceId = 'REPLACE_ME_DEVICE_ID';
const capability = 'measure_power';

try {
  const device = await Homey.devices.getDevice({ id: deviceId });
  const cap = device && device.capabilitiesObj && device.capabilitiesObj[capability];
  if (!cap) {
    log(`warning: ${capability} not present on ${deviceId}`);
    return null;
  }
  return cap.value;
} catch (err) {
  log(`error reading ${capability} from ${deviceId}: ${err.message}`);
  return null;
}
