// POST /api/license/activate   body: key=<passkey>&machine=<fingerprint>
// Confirms a paid key (looked up in license_keys), enforces its device limit,
// and returns a signed lease the desktop app verifies offline.
//   OK\n<lease> | SEATS_FULL | REVOKED | BAD_KEY
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
    const key = String(body.key || '').trim();
    const machine = String(body.machine || '');
    if (!key || !machine) return L.sendText(res, 200, 'BAD_KEY');

    const k = await L.lookupKey(key);
    if (!k) return L.sendText(res, 200, 'BAD_KEY');
    if (!k.active) return L.sendText(res, 200, 'REVOKED');

    // seats tracked against the key's id, so the raw secret key isn't echoed in the lease
    const lease = await L.grantSeat({ id: k.id, name: k.email || 'cad2d', seats: k.seats }, machine);
    if (lease === 'SEATS_FULL') return L.sendText(res, 200, 'SEATS_FULL');
    return L.sendText(res, 200, 'OK\n' + lease);
  } catch (e) {
    console.error('activate error:', e.message);
    return L.sendText(res, 500, 'ERROR');
  }
};
