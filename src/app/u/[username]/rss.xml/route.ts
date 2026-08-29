import { getPublicUserProfile } from '@/server/queries/user';

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const data = await getPublicUserProfile(username);

  if (!data?.user || !data.user.isPublic) {
    return new Response('User not found or archive is private', { status: 404 });
  }

  const { user, entries = [] } = data;
  const url = new URL(request.url);
  const siteUrl = `${url.protocol}//${url.host}`;
  const profileUrl = `${siteUrl}/u/${user.username}`;

  const recentEntries = entries.slice(0, 50);

  const itemsXml = recentEntries
    .map((e) => {
      const entryTitle = escapeXml(`${e.title} (${e.category.toUpperCase()})`);
      const statusText = e.status.replace('_', ' ');
      const ratingText = e.rating ? ` - Rated ${e.rating}/10` : '';
      const notesText = e.notes ? `<br/><br/>${escapeXml(e.notes)}` : '';
      const desc = escapeXml(`Status: ${statusText}${ratingText}`) + notesText;
      const pubDate = new Date(e.updatedAt).toUTCString();

      return `
    <item>
      <title>${entryTitle}</title>
      <link>${profileUrl}</link>
      <guid isPermaLink="false">${e.id}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${desc}]]></description>
    </item>`;
    })
    .join('\n');

  const rssXml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(user.name)} (@${escapeXml(user.username || '')}) - ZedArchive</title>
    <link>${profileUrl}</link>
    <description>${escapeXml(user.bio || `Public media archive for @${user.username}`)}</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${profileUrl}/rss.xml" rel="self" type="application/rss+xml" />
    ${itemsXml}
  </channel>
</rss>`;

  return new Response(rssXml.trim(), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
