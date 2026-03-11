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
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">You're on the list.</h1>

        <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 16px;">
          Thanks for joining the NetGains waitlist. We're building AI-powered fitness coaching that actually understands your training.
        </p>

        <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 16px;">
          We'll email you when it's your turn to get access.
        </p>

        <p style="font-size: 14px; color: #666; margin-top: 32px;">
          — The NetGains Team
        </p>
      </div>
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
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">You've got access.</h1>

        <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 16px;">
          Welcome to the NetGains beta. Your AI fitness coach is ready.
        </p>

        <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 24px;">
          <strong>To get started:</strong>
        </p>

        <ol style="font-size: 16px; line-height: 1.8; color: #333; margin-bottom: 24px; padding-left: 20px;">
          <li>Go to <a href="https://netgainsai.com" style="color: #7c3aed;">netgainsai.com</a></li>
          <li>Sign up with this email address</li>
          <li>Start chatting with your coach</li>
        </ol>

        <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 16px;">
          The coach will ask a few questions to learn about your goals and training history, then you're off.
        </p>

        <p style="font-size: 14px; color: #666; margin-top: 32px;">
          Questions? Just reply to this email.<br/>
          — The NetGains Team
        </p>
      </div>
    `,
  });

  if (error) {
    console.error('[Email] Beta invite failed:', error);
    throw error;
  }
}
