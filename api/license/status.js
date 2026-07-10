// POST /api/license/status   body: key=<licenseKey>
// Seat usage for a key (support/vendor tool). -> "OK\n<used>/<total>[ REVOKED]" | "BAD_KEY"
const L = require('../_lib/license.js');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return L.sendText(res, 200, 'OK');
  }
  if (req.method !== 'POST') return L.sendText(res, 405, 'ERROR');
  try {
    const info = L.verifyKey(String(L.readForm(req).key || ''));
    if (!info) return L.sendText(res, 200, 'BAD_KEY');
    const usage = await L.seatUsage(info.id, info.seats);
    const revoked = (await L.isRevoked(info.id)) ? ' REVOKED' : '';
    return L.sendText(res, 200, 'OK\n' + usage + revoked);
  } catch (e) {
    console.error('status error:', e.message);
    return L.sendText(res, 500, 'ERROR');
  }
};
