// POST /api/auth/logout   body: refresh=<supabaseRefreshToken>&machine=..
// Signs out on this device and frees its seat. Best-effort: resolves the
// account from the refresh token, then releases the seat.  -> "OK"
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
    const auth = refresh ? await L.refreshGrant(refresh) : null;
    if (auth) await L.releaseSeat(auth.userId, machine);
    return L.sendText(res, 200, 'OK');
  } catch (e) {
    console.error('auth/logout error:', e.message);
    return L.sendText(res, 200, 'OK');   // logout is best-effort; app clears locally regardless
  }
};
