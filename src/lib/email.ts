import { Resend } from 'resend';

const FROM_EMAIL = 'NetGains <coach@netgainsai.com>';

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
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #141414; border-radius: 16px; overflow: hidden;">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); padding: 32px 24px; text-align: center;">
                      <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; text-transform: uppercase;">NetGains</h1>
                    </td>
                  </tr>
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 32px;">
                      <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #ffffff;">You're on the list.</h2>
                      <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #a1a1aa;">
                        Thanks for joining the NetGains waitlist. We're building AI-powered fitness coaching that actually understands your training.
                      </p>
                      <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #a1a1aa;">
                        We'll email you when it's your turn to get access.
                      </p>
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 24px 32px; border-top: 1px solid #27272a;">
                      <p style="margin: 0; font-size: 14px; color: #52525b;">
                        — The NetGains Team
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
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
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #141414; border-radius: 16px; overflow: hidden;">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); padding: 32px 24px; text-align: center;">
                      <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; text-transform: uppercase;">NetGains</h1>
                    </td>
                  </tr>
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 32px;">
                      <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #ffffff;">You've got access.</h2>
                      <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #a1a1aa;">
                        Welcome to the NetGains beta. Your AI fitness coach is ready.
                      </p>

                      <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #ffffff;">To get started:</p>

                      <table cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                        <tr>
                          <td style="padding: 8px 0;">
                            <span style="display: inline-block; width: 24px; height: 24px; background-color: #7c3aed; color: #fff; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 600; margin-right: 12px;">1</span>
                            <span style="font-size: 16px; color: #a1a1aa;">Go to <a href="https://netgainsai.com" style="color: #a78bfa; text-decoration: none;">netgainsai.com</a></span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <span style="display: inline-block; width: 24px; height: 24px; background-color: #7c3aed; color: #fff; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 600; margin-right: 12px;">2</span>
                            <span style="font-size: 16px; color: #a1a1aa;">Sign up with this email</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <span style="display: inline-block; width: 24px; height: 24px; background-color: #7c3aed; color: #fff; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 600; margin-right: 12px;">3</span>
                            <span style="font-size: 16px; color: #a1a1aa;">Start chatting with your coach</span>
                          </td>
                        </tr>
                      </table>

                      <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #a1a1aa;">
                        The coach will ask a few questions to learn about your goals, then you're off.
                      </p>
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 24px 32px; border-top: 1px solid #27272a;">
                      <p style="margin: 0; font-size: 14px; color: #52525b;">
                        Questions? Just reply to this email.<br/>
                        — The NetGains Team
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  });

  if (error) {
    console.error('[Email] Beta invite failed:', error);
    throw error;
  }
}
