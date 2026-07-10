// POST /api/admin/issue-key   body: token=<admin>&email=<customer>&seats=<n>&note=<invoice>
// You call this after confirming a payment. It generates a fresh 65-char key,
// stores it, emails it to the customer (reusing the Gmail setup from
// api/contact.js), and returns it so an admin page can show it too.
//   -> { ok:true, key, id, emailed } | { error } (401 on bad token)
const L = require('../_lib/license.js');

// Lazy, optional: the key is created + returned even if email can't be sent.
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (e) { /* email just skipped */ }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    const body = L.readForm(req);
    const admin = process.env.CAD2D_ADMIN_TOKEN;
    if (!admin || String(body.token || '') !== admin.trim()) return res.status(401).json({ error: 'unauthorized' });

    const email = String(body.email || '').trim();
    const seats = Math.max(1, parseInt(body.seats, 10) || 1);
    const note = String(body.note || '').slice(0, 200);
    const { id, key } = await L.issueKey({ email, seats, note });

    let emailed = false;
    if (email && nodemailer && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      try {
        const t = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
        });
        await t.sendMail({
          from: `"Full Moon Computing" <${process.env.GMAIL_USER}>`,
          to: email,
          subject: 'Your cad2d license key',
          html: `
            <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;">
              <h2 style="color:#1a1a2e;">Thank you for your purchase</h2>
              <p style="color:#444;line-height:1.6;">Here is your cad2d license key. Open cad2d,
                 go to <strong>Tools &rsaquo; License</strong>, paste the key and click
                 <strong>Activate</strong>. It works on up to <strong>${seats}</strong>
                 device${seats === 1 ? '' : 's'}.</p>
              <p style="font-family:monospace;font-size:15px;background:#f4f4f7;border:1px solid #e0e0e6;
                        border-radius:8px;padding:14px 16px;word-break:break-all;color:#1a1a2e;">${escapeHtml(key)}</p>
              <p style="color:#888;font-size:0.85rem;">Keep this key safe — it is your proof of licence.
                 Questions? Reply to this email.</p>
              <p style="color:#bbb;font-size:0.8rem;">Full Moon Computing · fullmooncomputing.in</p>
            </div>`,
        });
        emailed = true;
      } catch (e) { console.error('issue-key email failed:', e.message); }
    }
    res.status(200).json({ ok: true, key, id, emailed });
  } catch (e) {
    console.error('issue-key error:', e.message);
    res.status(500).json({ error: 'server error' });
  }
};

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
