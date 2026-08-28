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

  const entriesXml = recentEntries
    .map((e) => {
      const entryTitle = escapeXml(`${e.title} (${e.category.toUpperCase()})`);
      const statusText = e.status.replace('_', ' ');
      const ratingText = e.rating ? ` - Rated ${e.rating}/10` : '';
      const notesText = e.notes ? `<br/><br/>${escapeXml(e.notes)}` : '';
      const desc = escapeXml(`Status: ${statusText}${ratingText}`) + notesText;
      const updatedDate = new Date(e.updatedAt).toISOString();

      return `
  <entry>
    <title>${entryTitle}</title>
    <link href="${profileUrl}" />
    <id>urn:uuid:${e.id}</id>
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
