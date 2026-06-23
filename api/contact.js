const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, phone, service, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }

  const sanitized = {
    name: name.slice(0, 100),
    email: email.slice(0, 200),
    phone: (phone || '').slice(0, 20),
    service: (service || '').slice(0, 50),
    message: message.slice(0, 2000),
  };

  const { error: dbError } = await supabase.from('contacts').insert([sanitized]);

  if (dbError) {
    console.error('Supabase error:', dbError);
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
      replyTo: sanitized.email,
      subject: `New enquiry from ${sanitized.name}`,
      html: `
        <h2 style="color:#1a1a2e;font-family:sans-serif;">New Contact Form Submission</h2>
        <table cellpadding="10" style="border-collapse:collapse;font-family:sans-serif;width:100%;max-width:600px;">
          <tr style="background:#f8f9fa;"><td style="font-weight:bold;color:#555;width:120px;">Name</td><td>${sanitized.name}</td></tr>
          <tr><td style="font-weight:bold;color:#555;">Email</td><td><a href="mailto:${sanitized.email}">${sanitized.email}</a></td></tr>
          <tr style="background:#f8f9fa;"><td style="font-weight:bold;color:#555;">Phone</td><td>${sanitized.phone || '—'}</td></tr>
          <tr><td style="font-weight:bold;color:#555;">Service</td><td>${sanitized.service || '—'}</td></tr>
          <tr style="background:#f8f9fa;"><td style="font-weight:bold;color:#555;vertical-align:top;">Message</td><td>${sanitized.message.replace(/\n/g, '<br>')}</td></tr>
        </table>
        <p style="font-family:sans-serif;color:#999;font-size:0.85rem;margin-top:2rem;">Sent from fullmooncomputing.in contact form</p>
      `,
    });
  } catch (emailErr) {
    console.error('Email error:', emailErr);
    // Don't fail the request — data is already saved to Supabase
  }

  return res.status(200).json({ success: true });
};
