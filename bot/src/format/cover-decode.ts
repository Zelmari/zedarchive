import { MAX_COVER_IMAGE_LENGTH } from '@/lib/constants';

export const COVER_ATTACHMENT_NAME = 'cover.webp';
export const MAX_DECODED_COVER_BYTES = 1_500_000;

export type DecodedCover =
  | { kind: 'https'; url: string }
  | { kind: 'bytes'; buffer: Buffer; filename: string; mime: string }
  | { kind: 'none' };

export function decodeCoverImage(coverImage?: string | null): DecodedCover {
  if (typeof coverImage !== 'string' || coverImage.length === 0) {
    return { kind: 'none' };
  }

  if (coverImage.length > MAX_COVER_IMAGE_LENGTH) {
    return { kind: 'none' };
  }

  if (coverImage.startsWith('https://')) {
    return { kind: 'https', url: coverImage };
  }

  const match = coverImage.match(
    /^data:(image\/(?:webp|jpeg|jpg|png|gif));base64,([A-Za-z0-9+/]+={0,2})$/i,
  );
  if (!match) {
    return { kind: 'none' };
  }

  const rawMime = match[1];
  const base64 = match[2];
  if (!rawMime || !base64) {
    return { kind: 'none' };
  }

  const mime = rawMime.toLowerCase() === 'image/jpg' ? 'image/jpeg' : rawMime.toLowerCase();
  const buffer = Buffer.from(base64, 'base64');

  if (buffer.length === 0 || buffer.length > MAX_DECODED_COVER_BYTES) {
    return { kind: 'none' };
  }

  const validMagic =
    mime === 'image/webp'
      ? buffer.length >= 12 &&
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
      : mime === 'image/jpeg'
        ? buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
        : mime === 'image/png'
          ? buffer.length >= 4 &&
            buffer[0] === 0x89 &&
            buffer[1] === 0x50 &&
            buffer[2] === 0x4e &&
            buffer[3] === 0x47
          : buffer.length >= 4 &&
            buffer[0] === 0x47 &&
            buffer[1] === 0x49 &&
            buffer[2] === 0x46 &&
            buffer[3] === 0x38;

  if (!validMagic) {
    return { kind: 'none' };
  }

  const filename =
    mime === 'image/webp'
      ? 'cover.webp'
      : mime === 'image/jpeg'
        ? 'cover.jpg'
        : mime === 'image/png'
          ? 'cover.png'
          : 'cover.gif';

  return { kind: 'bytes', buffer, filename, mime };
}
