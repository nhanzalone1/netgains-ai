import { createClient } from '@supabase/supabase-js';
import { sendBetaInvite } from '@/lib/email';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  try {
    // Check admin secret
    const authHeader = request.headers.get('Authorization');
    const expectedSecret = `Bearer ${process.env.ADMIN_API_SECRET}`;

    if (!process.env.ADMIN_API_SECRET || authHeader !== expectedSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, addToTesters = false } = await request.json();

    if (!email || typeof email !== 'string') {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Optionally add to allowed_testers
    if (addToTesters) {
      const { error: insertError } = await getServiceClient()
        .from('allowed_testers')
        .insert([{ email: normalizedEmail, added_by: 'admin-api' }]);

      if (insertError) {
        // Check if already exists (unique constraint)
        if (insertError.code === '23505') {
          console.log('[Admin] Email already in allowed_testers:', normalizedEmail);
        } else {
          console.error('[Admin] Insert error:', insertError);
          return Response.json({ error: 'Failed to add to testers' }, { status: 500 });
        }
      }
    }

    // Send beta invite email
    await sendBetaInvite(normalizedEmail);

    return Response.json({
      success: true,
      email: normalizedEmail,
      addedToTesters: addToTesters
    });
  } catch (error) {
    console.error('[Admin] Invite error:', error);
    return Response.json({ error: 'Failed to send invite' }, { status: 500 });
  }
}
