// POST /api/license/revoke   body: token=<admin>&key=<licenseKey OR>&id=<licenseId>&action=revoke|unrevoke
// Admin-only kill switch. -> "OK" | "FORBIDDEN" | "BAD_KEY"
// Accepts either a full license key (verified, id extracted) or a bare id.
// Not called by the desktop client; use it from support/curl.
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

    const info = L.verifyKey(String(body.key || ''));
    const id = info ? info.id : String(body.id || '');
    if (!id) return L.sendText(res, 200, 'BAD_KEY');

    const unrevoke = String(body.action || 'revoke') === 'unrevoke';
    await L.setRevoked(id, !unrevoke);
    return L.sendText(res, 200, 'OK');
  } catch (e) {
    console.error('revoke error:', e.message);
    return L.sendText(res, 500, 'ERROR');
  }
};
