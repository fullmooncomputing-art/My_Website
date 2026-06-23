const nodemailer = require('nodemailer');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Parse body explicitly in case Vercel doesn't auto-parse
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    const { name, email, phone, service, message } = body;

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Name, email, and message are required.' });
    }

    const data = {
      name: String(name).slice(0, 100),
      email: String(email).slice(0, 200),
      phone: String(phone || '').slice(0, 20),
      service: String(service || '').slice(0, 50),
      message: String(message).slice(0, 2000),
    };

    const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '');
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    const dbRes = await fetch(`${supabaseUrl}/rest/v1/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(data),
    });

    if (!dbRes.ok) {
      const errText = await dbRes.text();
      console.error('Supabase error:', dbRes.status, errText);
      return res.status(500).json({ error: 'Failed to save your message. Please try again.' });
    }

    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      });

      await transporter.sendMail({
        from: `"Full Moon Computing" <${process.env.GMAIL_USER}>`,
        to: process.env.GMAIL_USER,
        replyTo: data.email,
        subject: `New enquiry from ${data.name}`,
        html: `
          <h2 style="color:#1a1a2e;font-family:sans-serif;">New Contact Form Submission</h2>
          <table cellpadding="10" style="border-collapse:collapse;font-family:sans-serif;width:100%;max-width:600px;">
            <tr style="background:#f8f9fa;"><td style="font-weight:bold;color:#555;width:120px;">Name</td><td>${data.name}</td></tr>
            <tr><td style="font-weight:bold;color:#555;">Email</td><td><a href="mailto:${data.email}">${data.email}</a></td></tr>
            <tr style="background:#f8f9fa;"><td style="font-weight:bold;color:#555;">Phone</td><td>${data.phone || '—'}</td></tr>
            <tr><td style="font-weight:bold;color:#555;">Service</td><td>${data.service || '—'}</td></tr>
            <tr style="background:#f8f9fa;"><td style="font-weight:bold;color:#555;vertical-align:top;">Message</td><td>${data.message.replace(/\n/g, '<br>')}</td></tr>
          </table>
          <p style="font-family:sans-serif;color:#999;font-size:0.85rem;margin-top:2rem;">Sent from fullmooncomputing.in contact form</p>
        `,
      });
    } catch (emailErr) {
      console.error('Email error:', emailErr.message);
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Handler error:', err.message, err.stack);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};
