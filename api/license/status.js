// POST /api/license/status   body: key=<passkey>
// Seat usage for a key (support tool). -> "OK\n<used>/<total>[ REVOKED]" | "BAD_KEY"
const L = require('../_lib/license.js');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return L.sendText(res, 200, 'OK');
  }
  if (req.method !== 'POST') return L.sendText(res, 405, 'ERROR');
  try {
    const k = await L.lookupKey(String(L.readForm(req).key || '').trim());
    if (!k) return L.sendText(res, 200, 'BAD_KEY');
    const usage = await L.seatUsage(k.id, k.seats);
    return L.sendText(res, 200, 'OK\n' + usage + (k.active ? '' : ' REVOKED'));
  } catch (e) {
    console.error('status error:', e.message);
    return L.sendText(res, 500, 'ERROR');
  }
};
