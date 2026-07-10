// POST /api/account/deactivate   Authorization: Bearer <token>   body: { machine }
// Lets a signed-in customer free one of their own device seats from the web.
//   -> { ok: true }
const L = require('../_lib/license.js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const user = await L.resolveUser(bearer);
    if (!user) return res.status(401).json({ error: 'not signed in' });

    const machine = String(L.readForm(req).machine || '');
    if (!machine) return res.status(400).json({ error: 'machine required' });
    await L.releaseSeat(user.userId, machine);   // scoped to THIS user's id — can't touch others
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('account/deactivate error:', e.message);
    res.status(500).json({ error: 'server error' });
  }
};
