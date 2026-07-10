// GET /api/account/me   Authorization: Bearer <supabase access token>
// The signed-in customer's cad2d license + activated devices, for the account
// page.  -> { email, licensed, seats, devices: [{machine, expiry}] }
const L = require('../_lib/license.js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const user = await L.resolveUser(bearer);
    if (!user) return res.status(401).json({ error: 'not signed in' });

    const ent = await L.getEntitlement(user.userId);      // null if none/inactive
    const devices = await L.listDevices(user.userId);
    res.status(200).json({
      email: user.email,
      licensed: !!ent,
      seats: ent ? ent.seats : 0,
      devices: devices.map(d => ({ machine: d.machine, expiry: d.expiry })),
    });
  } catch (e) {
    console.error('account/me error:', e.message);
    res.status(500).json({ error: 'server error' });
  }
};
