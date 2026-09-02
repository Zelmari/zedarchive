import { escapeXml, loadPublicFeed } from '@/server/feeds';

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const data = await loadPublicFeed(username, request);

  if (!data) {
    return new Response('User not found or archive is private', { status: 404 });
  }

  const { user, recentEntries, profileUrl } = data;
  const entriesXml = recentEntries
    .map((entry) => {
      const entryTitle = escapeXml(`${entry.title} (${entry.category.toUpperCase()})`);
      const statusText = entry.status.replace('_', ' ');
      const ratingText = entry.rating ? ` - Rated ${entry.rating}/10` : '';
      const notesText = entry.notes ? `<br/><br/>${escapeXml(entry.notes)}` : '';
      const desc = escapeXml(`Status: ${statusText}${ratingText}`) + notesText;
      const updatedDate = new Date(entry.updatedAt).toISOString();

      return `
  <entry>
    <title>${entryTitle}</title>
    <link href="${profileUrl}" />
    <id>urn:uuid:${entry.id}</id>
    <updated>${updatedDate}</updated>
    <summary type="html"><![CDATA[${desc}]]></summary>
  </entry>`;
    })
    .join('\n');

  const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(user.name)} (@${escapeXml(user.username || '')}) - ZedArchive</title>
  <subtitle>${escapeXml(user.bio || `Public media archive for @${user.username}`)}</subtitle>
  <link href="${profileUrl}" />
  <link href="${profileUrl}/atom.xml" rel="self" />
  <id>${profileUrl}</id>
  <updated>${new Date().toISOString()}</updated>
  <author>
    <name>${escapeXml(user.name)}</name>
  </author>
  ${entriesXml}
</feed>`;

  return new Response(atomXml.trim(), {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
