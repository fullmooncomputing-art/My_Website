// POST /api/license/revoke   body: token=<admin>&key=<passkey>&action=revoke|unrevoke
// Admin kill switch: flips the key's active flag. A revoked key stops working on
// every device within one lease period. -> "OK" | "FORBIDDEN" | "BAD_KEY"
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
    const admin = process.env.CAD2D_ADMIN_TOKEN;
    if (!admin || String(body.token || '') !== admin.trim()) return L.sendText(res, 403, 'FORBIDDEN');

    const key = String(body.key || '').trim();
    const k = await L.lookupKey(key);
    if (!k) return L.sendText(res, 200, 'BAD_KEY');

    const unrevoke = String(body.action || 'revoke') === 'unrevoke';
    await L.setKeyActive(key, unrevoke);   // revoke -> active=false
    return L.sendText(res, 200, 'OK');
  } catch (e) {
    console.error('revoke error:', e.message);
    return L.sendText(res, 500, 'ERROR');
  }
};
