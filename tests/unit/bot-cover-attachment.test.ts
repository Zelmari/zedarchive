import { describe, it, expect } from 'vitest';
import { decodeCoverImage, MAX_DECODED_COVER_BYTES } from '../../bot/src/format/cover-decode';
import { MAX_COVER_IMAGE_LENGTH } from '@/lib/constants';

const dataUri = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString('base64')}`;

describe('decodeCoverImage', () => {
  it('returns none for missing covers', () => {
    expect(decodeCoverImage(null)).toEqual({ kind: 'none' });
    expect(decodeCoverImage('')).toEqual({ kind: 'none' });
    expect(decodeCoverImage(undefined)).toEqual({ kind: 'none' });
  });

  it('accepts https URLs without fetching or validating them', () => {
    expect(decodeCoverImage('https://cdn.example/p.jpg')).toEqual({
      kind: 'https',
      url: 'https://cdn.example/p.jpg',
    });
  });

  it('rejects insecure URLs', () => {
    expect(decodeCoverImage('http://insecure/example.jpg')).toEqual({ kind: 'none' });
  });

  it('decodes WebP data URIs', () => {
    const result = decodeCoverImage(
      dataUri('image/webp', Buffer.from('524946460000000057454250', 'hex')),
    );

    expect(result).toMatchObject({
      kind: 'bytes',
      filename: 'cover.webp',
      mime: 'image/webp',
    });
  });

  it('decodes JPEG data URIs and normalizes the jpg alias', () => {
    const jpeg = Buffer.from('ffd8ff00', 'hex');

    expect(decodeCoverImage(dataUri('image/jpeg', jpeg))).toMatchObject({
      kind: 'bytes',
      filename: 'cover.jpg',
      mime: 'image/jpeg',
    });
    expect(decodeCoverImage(dataUri('image/jpg', jpeg))).toMatchObject({
      kind: 'bytes',
      filename: 'cover.jpg',
      mime: 'image/jpeg',
    });
  });

  it('decodes PNG and GIF data URIs', () => {
    expect(decodeCoverImage(dataUri('image/png', Buffer.from('89504e4700', 'hex')))).toMatchObject({
      kind: 'bytes',
      filename: 'cover.png',
      mime: 'image/png',
    });
    expect(decodeCoverImage(dataUri('image/gif', Buffer.from('4749463800', 'hex')))).toMatchObject({
      kind: 'bytes',
      filename: 'cover.gif',
      mime: 'image/gif',
    });
  });

  it('rejects unsupported, malformed, and empty data URIs', () => {
    const payload = Buffer.from('89504e4700', 'hex').toString('base64');

    expect(decodeCoverImage(`data:text/html;base64,${payload}`)).toEqual({ kind: 'none' });
    expect(decodeCoverImage(`data:image/svg+xml;base64,${payload}`)).toEqual({ kind: 'none' });
    expect(decodeCoverImage(`data:image/avif;base64,${payload}`)).toEqual({ kind: 'none' });
    expect(decodeCoverImage('data:image/webp;base64,')).toEqual({ kind: 'none' });
    expect(decodeCoverImage(`data:image/webp;charset=utf-8;base64,${payload}`)).toEqual({
      kind: 'none',
    });
  });

  it('rejects covers exceeding the encoded length limit', () => {
    expect(decodeCoverImage('x'.repeat(MAX_COVER_IMAGE_LENGTH + 1))).toEqual({ kind: 'none' });
  });

  it('rejects decoded covers exceeding the byte limit', () => {
    const oversizedJpeg = Buffer.alloc(MAX_DECODED_COVER_BYTES + 1);
    oversizedJpeg[0] = 0xff;
    oversizedJpeg[1] = 0xd8;
    oversizedJpeg[2] = 0xff;

    expect(decodeCoverImage(dataUri('image/jpeg', oversizedJpeg))).toEqual({ kind: 'none' });
  });

  it('rejects mismatched magic bytes', () => {
    expect(decodeCoverImage(dataUri('image/webp', Buffer.from('89504e4700', 'hex')))).toEqual({
      kind: 'none',
    });
  });
});
