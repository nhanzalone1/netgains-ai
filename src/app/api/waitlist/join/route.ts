import { createClient } from '@supabase/supabase-js';
import { sendWaitlistConfirmation } from '@/lib/email';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  try {
    // Check env vars
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('[Waitlist] Missing NEXT_PUBLIC_SUPABASE_URL');
      return Response.json({ error: 'Server configuration error' }, { status: 500 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[Waitlist] Missing SUPABASE_SERVICE_ROLE_KEY');
      return Response.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return Response.json({ error: 'Invalid email format' }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Check if already on waitlist
    const { data: existing } = await supabase
      .from('waitlist_emails')
      .select('id')
      .eq('email', normalizedEmail)
      .single();

    if (existing) {
      // Already on waitlist - still return success (don't reveal if email exists)
      return Response.json({ success: true, alreadyOnList: true });
    }

    // Add to waitlist
    const { error: insertError } = await supabase
      .from('waitlist_emails')
      .insert([{ email: normalizedEmail }]);

    if (insertError) {
      console.error('[Waitlist] Insert error:', insertError);
      return Response.json({ error: 'Failed to join waitlist' }, { status: 500 });
    }

    // Send confirmation email
    try {
      await sendWaitlistConfirmation(normalizedEmail);
    } catch (emailError) {
      // Log but don't fail the request - user is still on the waitlist
      console.error('[Waitlist] Email send failed:', emailError);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[Waitlist] Error:', error);
    return Response.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
