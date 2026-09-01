import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { auth } from '@/lib/auth';
import { MAX_COVER_IMAGE_LENGTH } from '@/lib/constants';

const ALLOWED_FORMATS = new Set(['png', 'jpeg', 'jpg', 'webp', 'gif', 'avif']);

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contentType = request.headers.get('content-type') || '';
    let buffer: Buffer | null = null;

    if (contentType.includes('application/json')) {
      const body = await request.json();
      if (typeof body?.image === 'string') {
        const match = body.image.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/);
        if (match && match[1]) {
          buffer = Buffer.from(match[1], 'base64');
        }
      }
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (file) {
        const bytes = await file.arrayBuffer();
        buffer = Buffer.from(bytes);
      }
    }

    if (!buffer || buffer.length === 0) {
      return NextResponse.json({ error: 'No valid image data provided' }, { status: 400 });
    }

    let sanitizedBuffer: Buffer;
    try {
      const image = sharp(buffer);
      const metadata = await image.metadata();
      if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
        return NextResponse.json({ error: 'Invalid or unsupported image format' }, { status: 400 });
      }
      sanitizedBuffer = await sharp(buffer).webp({ quality: 85 }).toBuffer();
    } catch {
      return NextResponse.json({ error: 'Invalid image content' }, { status: 400 });
    }

    const finalDataUri = `data:image/webp;base64,${sanitizedBuffer.toString('base64')}`;
    if (finalDataUri.length > MAX_COVER_IMAGE_LENGTH) {
      return NextResponse.json(
        { error: `Image exceeds maximum allowed size (${MAX_COVER_IMAGE_LENGTH} bytes)` },
        { status: 413 },
      );
    }

    // In a full R2 bucket deployment, this puts the object into R2 and returns the CDN URL.
    // For universal portability, we return the normalized URL string.
    return NextResponse.json({
      success: true,
      url: finalDataUri,
    });
  } catch (error) {
    console.error('Asset upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
