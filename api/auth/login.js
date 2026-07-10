// POST /api/auth/login   body: email=..&password=..&machine=..
// Signs the customer in (Supabase Auth), checks their cad2d entitlement + seats,
// and returns a signed lease. Serves the desktop app's "Sign in" screen.
//   OK\n<lease>\n<refreshToken> | BAD_CREDENTIALS | NO_ENTITLEMENT | SEATS_FULL
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
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    const machine = String(body.machine || '');
    if (!email || !password || !machine) return L.sendText(res, 200, 'BAD_CREDENTIALS');

    const auth = await L.passwordGrant(email, password);
    if (!auth) return L.sendText(res, 200, 'BAD_CREDENTIALS');

    const r = await L.activateAccount(auth, machine);
    if (r.code !== 'OK') return L.sendText(res, 200, r.code);
    return L.sendText(res, 200, 'OK\n' + r.lease + '\n' + r.refresh);
  } catch (e) {
    console.error('auth/login error:', e.message);
    return L.sendText(res, 500, 'ERROR');
  }
};
