import { getPublicUserProfile, type PublicProfileResult } from '@/server/queries/user';
import type { MediaEntry } from '@/types/media';
import { getCanonicalProfileUrl } from '@/lib/site-url';

export interface PublicFeedItem {
  id: string;
  title: string;
  category: MediaEntry['category'];
  status: MediaEntry['status'];
  rating: MediaEntry['rating'];
  notes: MediaEntry['notes'];
  updatedAt: MediaEntry['updatedAt'];
}

export interface PublicFeedData {
  user: PublicProfileResult['user'];
  recentEntries: PublicFeedItem[];
  profileUrl: string;
}

export function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    switch (character) {
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
        return character;
    }
  });
}

export async function loadPublicFeed(username: string): Promise<PublicFeedData | null> {
  const data = await getPublicUserProfile(username);

  if (!data?.user || !data.user.isPublic || !data.user.username) {
    return null;
  }

  const profileUrl = getCanonicalProfileUrl(data.user.username);
  const recentEntries = data.entries.slice(0, 50).map((entry) => ({
    id: entry.id,
    title: entry.title,
    category: entry.category,
    status: entry.status,
    rating: entry.rating ?? null,
    notes: entry.notes ?? null,
    updatedAt: entry.updatedAt,
  }));

  return {
    user: data.user,
    recentEntries,
    profileUrl,
  };
}
