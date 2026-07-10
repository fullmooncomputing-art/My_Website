// GET /api/config  -> { supabaseUrl, supabaseAnonKey }
// Public config for the browser account page. Both values are safe to expose:
// the anon key is designed to live in client-side code (RLS protects data).
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({
    supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, ''),
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  });
};
