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

      // Notification to owner
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

      // Auto-reply to the person who submitted the form
      await transporter.sendMail({
        from: `"Full Moon Computing" <${process.env.GMAIL_USER}>`,
        to: data.email,
        replyTo: process.env.GMAIL_USER,
        subject: `We've received your message — Full Moon Computing`,
        html: `
          <!DOCTYPE html>
          <html>
          <body style="margin:0;padding:0;background:#f8f9fa;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;padding:40px 20px;">
              <tr><td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

                  <!-- Header -->
                  <tr>
                    <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:40px 40px 32px;text-align:center;">
                      <div style="width:50px;height:50px;background:linear-gradient(135deg,#ffd700,#ffed4e);border-radius:50%;margin:0 auto 16px;"></div>
                      <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Full Moon Computing</h1>
                      <p style="color:#ffd700;margin:8px 0 0;font-size:14px;">Professional Web Services</p>
                    </td>
                  </tr>

                  <!-- Body -->
                  <tr>
                    <td style="padding:40px;">
                      <h2 style="color:#1a1a2e;margin:0 0 16px;font-size:22px;">Hi ${data.name}, thank you for reaching out!</h2>
                      <p style="color:#555;line-height:1.8;margin:0 0 20px;font-size:15px;">
                        We've received your message and we're glad you contacted us. Our team will review your enquiry and get back to you within <strong>24 hours</strong>.
                      </p>

                      <!-- Summary box -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:10px;padding:24px;margin-bottom:24px;">
                        <tr><td>
                          <p style="color:#999;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;font-weight:600;">Your Submission Summary</p>
                          <table width="100%" cellpadding="6" cellspacing="0">
                            <tr><td style="color:#888;font-size:14px;width:90px;">Service</td><td style="color:#1a1a2e;font-size:14px;font-weight:600;">${data.service || 'Not specified'}</td></tr>
                            <tr><td style="color:#888;font-size:14px;">Message</td><td style="color:#555;font-size:14px;">${data.message.slice(0, 120)}${data.message.length > 120 ? '...' : ''}</td></tr>
                          </table>
                        </td></tr>
                      </table>

                      <p style="color:#555;line-height:1.8;margin:0 0 28px;font-size:15px;">
                        In the meantime, feel free to explore our website to learn more about our services.
                      </p>

                      <!-- CTA Button -->
                      <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                        <tr>
                          <td style="background:linear-gradient(135deg,#ffd700,#ffed4e);border-radius:50px;padding:14px 32px;">
                            <a href="https://fullmooncomputing.in" style="color:#1a1a2e;text-decoration:none;font-weight:700;font-size:15px;">Visit Our Website</a>
                          </td>
                        </tr>
                      </table>

                      <p style="color:#555;line-height:1.8;margin:0;font-size:15px;">
                        Warm regards,<br>
                        <strong style="color:#1a1a2e;">Full Moon Computing Team</strong><br>
                        <a href="mailto:contact@fullmooncomputing.in" style="color:#1a1a2e;font-size:14px;">contact@fullmooncomputing.in</a>
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background:#f8f9fa;padding:24px 40px;text-align:center;border-top:1px solid #eee;">
                      <p style="color:#999;font-size:12px;margin:0;">
                        © 2026 Full Moon Computing ·
                        <a href="https://fullmooncomputing.in" style="color:#999;">fullmooncomputing.in</a>
                      </p>
                      <p style="color:#bbb;font-size:11px;margin:6px 0 0;">You received this email because you submitted a contact form on our website.</p>
                    </td>
                  </tr>

                </table>
              </td></tr>
            </table>
          </body>
          </html>
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
