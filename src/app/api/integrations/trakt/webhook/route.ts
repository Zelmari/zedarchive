import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { userIntegrations } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { processTraktScrobble, type TraktScrobblePayload } from '@/server/integrations/traktSync';

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Missing integration token' }, { status: 401 });
    }

    // Find user integration by token
    const [integration] = await db
      .select()
      .from(userIntegrations)
      .where(and(eq(userIntegrations.provider, 'trakt'), eq(userIntegrations.accessToken, token)));

    if (!integration) {
      return NextResponse.json({ error: 'Invalid integration token' }, { status: 403 });
    }

    const body = (await request.json()) as TraktScrobblePayload;
    const result = await processTraktScrobble(integration.userId, body);

    // Update lastSyncedAt
    await db
      .update(userIntegrations)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(userIntegrations.id, integration.id));

    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error('Trakt webhook error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Webhook error' },
      { status: 500 },
    );
  }
}
