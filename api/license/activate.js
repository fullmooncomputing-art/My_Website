// POST /api/license/activate   body: key=<licenseKey>&machine=<fingerprint>
// -> "OK\n<lease>" | "SEATS_FULL" | "REVOKED" | "BAD_KEY"
// Serves the desktop client's License.activateOnline() call.
const L = require('../_lib/license.js');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return L.sendText(res, 200, 'OK');
  }
  if (req.method !== 'POST') return L.sendText(res, 405, 'ERROR');
  try {
    const body = L.readForm(req);
    const key = String(body.key || '');
    const machine = String(body.machine || '');
    const info = L.verifyKey(key);
    if (!info || !machine) return L.sendText(res, 200, 'BAD_KEY');
    if (await L.isRevoked(info.id)) return L.sendText(res, 200, 'REVOKED');

    const result = await L.grantSeat(info, machine);
    if (result === 'SEATS_FULL') return L.sendText(res, 200, 'SEATS_FULL');
    return L.sendText(res, 200, 'OK\n' + result);
  } catch (e) {
    console.error('activate error:', e.message);
    return L.sendText(res, 500, 'ERROR');
  }
};
