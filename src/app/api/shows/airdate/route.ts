import { getUpcomingAirdates } from '@/domain/airdate';
import { getSessionUser } from '@/server/internal';

export async function GET(request: Request): Promise<Response> {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get('ids') || '';
  const rawIds = idsParam
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 50);

  if (rawIds.length === 0) {
    return Response.json(
      {},
      {
        headers: {
          'Cache-Control': 'public, max-age=21600',
        },
      },
    );
  }

  const titlesParam = searchParams.get('titles') || '';
  let titles: string[] = [];
  try {
    const parsed: unknown = JSON.parse(titlesParam);
    if (Array.isArray(parsed)) {
      titles = parsed.map((t) => String(t ?? ''));
    }
  } catch {
    titles = [];
  }

  const items = rawIds.map((sourceId, index) => ({
    sourceId,
    title: titles[index] ?? '',
  }));

  const result = await getUpcomingAirdates(items);

  return Response.json(result, {
    headers: {
      'Cache-Control': 'public, max-age=21600',
    },
  });
}
