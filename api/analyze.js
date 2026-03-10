export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic error:', response.status, JSON.stringify(data));
      return res.status(response.status).json({ error: data?.error?.message || 'Anthropic API error', details: data });
    }

    const { userEmail, platform, niche, followers, offer } = req.body.emailData || {};

    if (userEmail && process.env.RESEND_API_KEY) {
      try {
        const raw = data.content.map(b => b.text || '').join('').trim()
          .replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
        const r = JSON.parse(raw);

        const underpaidPct = Math.round(r.underpaid_pct || 0);
        const gap = r.underpaid_amount_low && r.underpaid_amount_high
          ? `£${Math.round(r.underpaid_amount_low).toLocaleString()} – £${Math.round(r.underpaid_amount_high).toLocaleString()}`
          : null;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
          },
          body: JSON.stringify({
            from: 'NegotiRate <hello@negotirate.app>',
            to: userEmail,
            subject: `You're being underpaid by ${underpaidPct}% — your NegotiRate results`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #ffffff; padding: 40px; border-radius: 12px;">
                <h1 style="color: #8aff64; font-size: 28px; margin-bottom: 8px;">Your Brand Deal Analysis</h1>
                <p style="color: #999; margin-bottom: 32px;">${platform || 'Creator'} · ${niche || ''} · ${followers ? Number(followers).toLocaleString() + ' followers' : ''}</p>
                
                <div style="background: #1a1a1a; border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 1px solid #333;">
                  <p style="color: #999; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Brand's Offer</p>
                  <p style="font-size: 32px; font-weight: bold; margin: 0;">£${Number(offer || 0).toLocaleString()}</p>
                </div>

                <div style="background: #1a1a1a; border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 2px solid #8aff64;">
                  <p style="color: #999; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">You're Being Underpaid By</p>
                  <p style="font-size: 48px; font-weight: bold; color: #8aff64; margin: 0;">${underpaidPct}%</p>
                  ${gap ? `<p style="color: #999; margin: 8px 0 0;">That's roughly <strong style="color: #fff;">${gap}</strong> left on the table</p>` : ''}
                </div>

                <div style="background: #1a1a1a; border-radius: 12px; padding: 24px; margin-bottom: 32px; border: 1px solid #333;">
                  <p style="color: #8aff64; font-weight: bold; margin: 0 0 12px;">💡 Free Tip</p>
                  <p style="color: #ccc; margin: 0; line-height: 1.6;">${r.free_tip || 'Your engagement rate is your biggest asset. Always lead with it in negotiations.'}</p>
                </div>

                <div style="text-align: center; margin-bottom: 32px;">
                  <a href="https://negotirate.app/#pricing" style="background: #8aff64; color: #000; font-weight: bold; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-size: 16px; display: inline-block;">
                    Unlock Full Report — £25 →
                  </a>
                  <p style="color: #666; font-size: 13px; margin-top: 12px;">Counter-offer email · Negotiation scripts · Red flag scanner</p>
                </div>

                <hr style="border: none; border-top: 1px solid #222; margin: 32px 0;">
                <p style="color: #555; font-size: 12px; text-align: center; margin: 0;">
                  NegotiRate · Built for creators who are done getting lowballed<br>
                  <a href="https://negotirate.app" style="color: #666;">negotirate.app</a>
                </p>
              </div>
            `
          })
        });
      } catch (emailErr) {
        console.error('Email send failed:', emailErr.message);
      }
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Handler error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
