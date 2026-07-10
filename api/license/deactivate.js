// POST /api/license/deactivate   body: key=<licenseKey>&machine=<fingerprint>
// Frees this machine's seat. -> "OK" | "BAD_KEY"
// Serves the desktop client's License.deactivateOnline() call.
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
    const info = L.verifyKey(String(body.key || ''));
    const machine = String(body.machine || '');
    if (!info) return L.sendText(res, 200, 'BAD_KEY');
    await L.releaseSeat(info.id, machine);
    return L.sendText(res, 200, 'OK');
  } catch (e) {
    console.error('deactivate error:', e.message);
    return L.sendText(res, 500, 'ERROR');
  }
};
