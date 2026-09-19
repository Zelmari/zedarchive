import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { MAX_COVER_IMAGE_LENGTH, MAX_UPLOAD_BYTES, MAX_UPLOAD_PIXELS } from '@/lib/constants';
import { getSessionUser } from '@/server/internal';
import { checkRateLimit, clientKeyFromRequest } from '@/lib/rate-limit';

const ALLOWED_FORMATS = new Set(['png', 'jpeg', 'jpg', 'webp', 'gif', 'avif']);

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateKey = `${sessionUser.id}:${clientKeyFromRequest(request)}`;
    if (!checkRateLimit('asset-upload', rateKey, 20, 60_000)) {
      return NextResponse.json(
        { error: 'Too many uploads. Please wait a moment.' },
        { status: 429 },
      );
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Image is too large' }, { status: 413 });
    }

    const contentType = request.headers.get('content-type') || '';
    let buffer: Buffer | null = null;

    if (contentType.includes('application/json')) {
      const body = await request.json();
      if (typeof body?.image === 'string') {
        if (body.image.length > MAX_UPLOAD_BYTES) {
          return NextResponse.json({ error: 'Image is too large' }, { status: 413 });
        }
        const match = body.image.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/);
        if (match && match[1]) {
          buffer = Buffer.from(match[1], 'base64');
        }
      }
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (file) {
        if (file.size > MAX_UPLOAD_BYTES) {
          return NextResponse.json({ error: 'Image is too large' }, { status: 413 });
        }
        const bytes = await file.arrayBuffer();
        buffer = Buffer.from(bytes);
      }
    }

    if (!buffer || buffer.length === 0) {
      return NextResponse.json({ error: 'No valid image data provided' }, { status: 400 });
    }

    if (buffer.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Image is too large' }, { status: 413 });
    }

    let sanitizedBuffer: Buffer;
    try {
      const image = sharp(buffer, { limitInputPixels: MAX_UPLOAD_PIXELS, failOn: 'error' });
      const metadata = await image.metadata();
      if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
        return NextResponse.json({ error: 'Invalid or unsupported image format' }, { status: 400 });
      }
      // Animated GIFs are flattened to the first frame by design.
      sanitizedBuffer = await image.webp({ quality: 85 }).toBuffer();
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

    return NextResponse.json({
      success: true,
      url: finalDataUri,
    });
  } catch (error) {
    console.error('Asset upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
