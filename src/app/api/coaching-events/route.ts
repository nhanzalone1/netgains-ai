import { createClient } from '@/lib/supabase/server';
import { logCoachingEvent, logPREvents, type CoachingEventType, type EventData, type PRHitData } from '@/lib/coaching-events';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { eventType, eventData, prs } = body as {
      eventType?: CoachingEventType;
      eventData?: EventData;
      prs?: PRHitData[];
    };

    // Handle batch PR events
    if (prs && prs.length > 0) {
      const result = await logPREvents(user.id, prs);
      return Response.json(result);
    }

    // Handle single event
    if (!eventType || !eventData) {
      return Response.json({ error: 'Missing eventType or eventData' }, { status: 400 });
    }

    const result = await logCoachingEvent(user.id, eventType, eventData);
    return Response.json(result);
  } catch (error) {
    console.error('[CoachingEvents API] Error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
