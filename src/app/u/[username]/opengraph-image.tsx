import { ImageResponse } from 'next/og';
import { getPublicUserProfile } from '@/server/profile';
import { calculateArchiveStats } from '@/lib/stats';

export const alt = 'Media Archive on ZedArchive';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

type PageParams = {
  params: Promise<{ username: string }>;
};

export default async function OpenGraphImage({ params }: PageParams) {
  const { username } = await params;
  const data = await getPublicUserProfile(username);

  if (!data?.user || !data.user.isPublic) {
    return new ImageResponse(
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          backgroundColor: '#f7f4ee',
          color: '#1a1917',
          fontFamily: 'sans-serif',
          padding: '48px',
        }}
      >
        <div style={{ fontSize: 48, fontWeight: 700, marginBottom: 16 }}>ZedArchive</div>
        <div style={{ fontSize: 24, color: '#736f64' }}>Archive Unavailable or Private</div>
      </div>,
      { ...size },
    );
  }

  const stats = calculateArchiveStats(data.entries);

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        backgroundColor: '#f7f4ee',
        color: '#1a1917',
        padding: '64px',
        fontFamily: 'sans-serif',
        border: '16px solid #e5dfd3',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              backgroundColor: '#1a1917',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f7f4ee',
              fontSize: '20px',
              fontWeight: 800,
            }}
          >
            Z
          </div>
          <span style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.02em' }}>
            ZedArchive
          </span>
        </div>
        <div
          style={{
            fontSize: '20px',
            color: '#736f64',
            backgroundColor: '#eae4d8',
            padding: '6px 16px',
            borderRadius: '999px',
            fontWeight: 600,
          }}
        >
          @{data.user.username}
        </div>
      </div>

      {/* Center Masthead */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div
          style={{
            fontSize: '56px',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
          }}
        >
          {data.user.name}’s Archive
        </div>
        <div style={{ fontSize: '24px', color: '#736f64' }}>
          Tracking {stats.totalEntries} {stats.totalEntries === 1 ? 'title' : 'titles'} ·{' '}
          {stats.completedCount} completed · {stats.totalEpisodes} episodes · {stats.totalChapters}{' '}
          chapters
        </div>
      </div>

      {/* Category Pills */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        {stats.showCount > 0 && (
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #dcd5c8',
              borderRadius: '8px',
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '18px',
              fontWeight: 600,
            }}
          >
            📺 {stats.showCount} Shows
          </div>
        )}
        {stats.animeCount > 0 && (
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #dcd5c8',
              borderRadius: '8px',
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '18px',
              fontWeight: 600,
            }}
          >
            ✨ {stats.animeCount} Anime
          </div>
        )}
        {stats.bookCount > 0 && (
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #dcd5c8',
              borderRadius: '8px',
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '18px',
              fontWeight: 600,
            }}
          >
            📖 {stats.bookCount} Books
          </div>
        )}
        {stats.mangaCount > 0 && (
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #dcd5c8',
              borderRadius: '8px',
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '18px',
              fontWeight: 600,
            }}
          >
            📚 {stats.mangaCount} Manga
          </div>
        )}
      </div>
    </div>,
    { ...size },
  );
}
