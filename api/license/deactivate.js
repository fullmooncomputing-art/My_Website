// POST /api/license/deactivate   body: key=<passkey>&machine=<fingerprint>
// Frees this machine's seat for the key.  -> "OK" | "BAD_KEY"
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
    const k = await L.lookupKey(String(body.key || '').trim());
    const machine = String(body.machine || '');
    if (!k) return L.sendText(res, 200, 'BAD_KEY');
    await L.releaseSeat(k.id, machine);
    return L.sendText(res, 200, 'OK');
  } catch (e) {
    console.error('deactivate error:', e.message);
    return L.sendText(res, 500, 'ERROR');
  }
};
