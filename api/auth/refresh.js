// POST /api/auth/refresh   body: refresh=<supabaseRefreshToken>&machine=..
// Silent re-check the app runs near lease expiry: refreshes the Supabase
// session (no password needed), re-confirms entitlement + seats, and issues a
// fresh lease. Also the point where a revoked/entitlement-removed account stops.
//   OK\n<lease>\n<newRefreshToken> | BAD_CREDENTIALS | NO_ENTITLEMENT | SEATS_FULL
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
    const refresh = String(body.refresh || '');
    const machine = String(body.machine || '');
    if (!refresh || !machine) return L.sendText(res, 200, 'BAD_CREDENTIALS');

    const auth = await L.refreshGrant(refresh);
    if (!auth) return L.sendText(res, 200, 'BAD_CREDENTIALS');

    const r = await L.activateAccount(auth, machine);
    if (r.code !== 'OK') return L.sendText(res, 200, r.code);
    return L.sendText(res, 200, 'OK\n' + r.lease + '\n' + r.refresh);
  } catch (e) {
    console.error('auth/refresh error:', e.message);
    return L.sendText(res, 500, 'ERROR');
  }
};
