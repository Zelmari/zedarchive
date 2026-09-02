import { escapeXml, loadPublicFeed } from '@/server/feeds';

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const data = await loadPublicFeed(username, request);

  if (!data) {
    return new Response('User not found or archive is private', { status: 404 });
  }

  const { user, recentEntries, profileUrl } = data;
  const itemsXml = recentEntries
    .map((entry) => {
      const entryTitle = escapeXml(`${entry.title} (${entry.category.toUpperCase()})`);
      const statusText = entry.status.replace('_', ' ');
      const ratingText = entry.rating ? ` - Rated ${entry.rating}/10` : '';
      const notesText = entry.notes ? `\n\n${entry.notes}` : '';
      const rawDesc = `Status: ${statusText}${ratingText}${notesText}`;
      const safeCdata = rawDesc.replace(/\]\]>/g, ']]]]><![CDATA[>');
      const pubDate = new Date(entry.updatedAt).toUTCString();

      return `
    <item>
      <title>${entryTitle}</title>
      <link>${profileUrl}</link>
      <guid isPermaLink="false">${entry.id}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${safeCdata}]]></description>
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
