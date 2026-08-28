import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { MAX_COVER_IMAGE_LENGTH } from '@/lib/constants';

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contentType = request.headers.get('content-type') || '';
    let imageData: string | null = null;

    if (contentType.includes('application/json')) {
      const body = await request.json();
      imageData = typeof body?.image === 'string' ? body.image : null;
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (file) {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const mime = file.type || 'image/webp';
        imageData = `data:${mime};base64,${buffer.toString('base64')}`;
      }
    }

    if (!imageData || typeof imageData !== 'string') {
      return NextResponse.json({ error: 'No valid image data provided' }, { status: 400 });
    }

    if (imageData.length > MAX_COVER_IMAGE_LENGTH) {
      return NextResponse.json(
        { error: `Image exceeds maximum allowed size (${MAX_COVER_IMAGE_LENGTH} bytes)` },
        { status: 413 },
      );
    }

    // In a full R2 bucket deployment, this puts the object into R2 and returns the CDN URL.
    // For universal portability, we return the normalized URL string.
    return NextResponse.json({
      success: true,
      url: imageData,
    });
  } catch (error) {
    console.error('Asset upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
