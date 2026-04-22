import { Resend } from 'resend';

const FROM_EMAIL = 'NetGains <support.netgainsai@gmail.com>';

function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  return new Resend(process.env.RESEND_API_KEY);
}

export async function sendWaitlistConfirmation(email: string) {
  const { error } = await getResendClient().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "You're on the NetGains waitlist",
    html: `
<table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif;">
  <tr>
    <td align="center" style="padding: 40px 20px;">
      <table width="480" cellpadding="0" cellspacing="0" style="background-color: #141414; border-radius: 16px;">
        <tr>
          <td style="background-color: #06b6d4; padding: 32px 24px; text-align: center; border-radius: 16px 16px 0 0;">
            <span style="font-size: 28px; font-weight: 800; color: #ffffff; text-transform: uppercase; letter-spacing: -0.5px;">NETGAINSAI</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 40px 32px;">
            <p style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #ffffff;">You're on the list.</p>
            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #a1a1aa;">
              Thanks for joining the NetGains waitlist. We're building AI-powered fitness coaching that actually understands your training.
            </p>
            <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #a1a1aa;">
              We'll email you when it's your turn to get access.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 24px 32px; border-top: 1px solid #27272a;">
            <p style="margin: 0; font-size: 14px; color: #71717a;">— Noah and the NetGainsAI Team</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
    `,
  });

  if (error) {
    console.error('[Email] Waitlist confirmation failed:', error);
    throw error;
  }
}

export async function sendBetaInvite(email: string) {
  const { error } = await getResendClient().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "You're in — NetGains beta access",
    html: `
<table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif;">
  <tr>
    <td align="center" style="padding: 40px 20px;">
      <table width="480" cellpadding="0" cellspacing="0" style="background-color: #141414; border-radius: 16px;">
        <tr>
          <td style="background-color: #06b6d4; padding: 32px 24px; text-align: center; border-radius: 16px 16px 0 0;">
            <span style="font-size: 28px; font-weight: 800; color: #ffffff; text-transform: uppercase; letter-spacing: -0.5px;">NETGAINSAI</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 40px 32px;">
            <p style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #ffffff;">You've got access.</p>
            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #a1a1aa;">
              Welcome to the NetGains beta. Your AI fitness coach is ready.
            </p>
            <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #ffffff;">To get started:</p>
            <p style="margin: 0 0 8px 0; font-size: 16px; color: #a1a1aa;">1. Go to <a href="https://netgainsai.com" style="color: #22d3ee;">netgainsai.com</a></p>
            <p style="margin: 0 0 8px 0; font-size: 16px; color: #a1a1aa;">2. Sign up with this email</p>
            <p style="margin: 0 0 24px 0; font-size: 16px; color: #a1a1aa;">3. Start chatting with your coach</p>
            <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #a1a1aa;">
              The coach will ask a few questions to learn about your goals, then you're off.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 24px 32px; border-top: 1px solid #27272a;">
            <p style="margin: 0; font-size: 14px; color: #71717a;">Questions? Just reply to this email.<br/>— Noah and the NetGainsAI Team</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
    `,
  });

  if (error) {
    console.error('[Email] Beta invite failed:', error);
    throw error;
  }
}
