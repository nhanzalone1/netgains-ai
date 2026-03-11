import { createClient } from '@supabase/supabase-js';
import { sendWaitlistConfirmation } from '@/lib/email';

// Disable caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Use anon key - RLS policy allows public inserts to waitlist_emails
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(request: Request) {
  try {
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

    const supabase = getSupabaseClient();

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
    let emailStatus = 'not_attempted';
    const hasResendKey = !!process.env.RESEND_API_KEY;

    try {
      await sendWaitlistConfirmation(normalizedEmail);
      emailStatus = 'sent';
    } catch (emailError: unknown) {
      const errorMessage = emailError instanceof Error ? emailError.message : String(emailError);
      emailStatus = `failed: ${errorMessage}`;
    }

    return Response.json({
      success: true,
      debug: { hasResendKey, emailStatus }
    });
  } catch (error) {
    console.error('[Waitlist] Error:', error);
    return Response.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
