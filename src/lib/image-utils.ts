const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_SOURCE_DIMENSION = 4000; // guard against decompression bombs
const FETCH_TIMEOUT_MS = 10000;

function withTimeout(promise: Promise<string>, ms = FETCH_TIMEOUT_MS): Promise<string> {
  return Promise.race([
    promise,
    new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('Image load timed out')), ms)
    ),
  ]);
}

function drawToDataUrl(
  img: HTMLImageElement,
  maxWidth: number,
  maxHeight: number,
  quality: number
): string {
  let { width, height } = img;

  // Preserve aspect ratio while fitting within maxWidth and maxHeight
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  ctx.drawImage(img, 0, 0, width, height);

  // Try webp compression first, fall back to jpeg if webp isn't supported
  let dataUrl = canvas.toDataURL('image/webp', quality);
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  return dataUrl;
}

/**
 * Compresses an uploaded image file on the client using HTML5 Canvas.
 * Scales the image while preserving aspect ratio and outputs a lightweight Base64 data URL.
 *
 * @param file - The uploaded image file or blob
 * @param maxWidth - Maximum width (default: 320)
 * @param maxHeight - Maximum height (default: 480)
 * @param quality - Compression quality between 0 and 1 (default: 0.7)
 * @returns Base64 data URL
 */
export function compressImageFile(
  file: File | Blob | null | undefined,
  maxWidth = 320,
  maxHeight = 480,
  quality = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided'));
      return;
    }

    if (file.type && !file.type.startsWith('image/')) {
      reject(new Error('Selected file is not an image'));
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      reject(new Error('Image is too large (max 10 MB)'));
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('Failed to read image file'));
    };

    reader.onload = (event) => {
      const img = new Image();

      img.onerror = () => {
        reject(new Error('Failed to parse image data'));
      };

      img.onload = () => {
        if (img.naturalWidth > MAX_SOURCE_DIMENSION || img.naturalHeight > MAX_SOURCE_DIMENSION) {
          reject(new Error('Image dimensions are too large'));
          return;
        }

        try {
          resolve(drawToDataUrl(img, maxWidth, maxHeight, quality));
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Could not compress image'));
        }
      };

      img.src = event.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Fetches a remote image URL, renders it onto an HTML5 Canvas to scale and compress,
 * and returns a lightweight Base64 data URL.
 * Falls back gracefully on CORS or network failures.
 *
 * @returns Base64 data URL or empty string on failure
 */
export async function fetchAndCompressRemoteImage(
  imageUrl: string | null | undefined,
  maxWidth = 320,
  maxHeight = 480,
  quality = 0.7
): Promise<string> {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return '';
  }

  // Only allow http(s) URLs — never data: or file: schemes
  if (!/^https?:\/\//i.test(imageUrl)) {
    return '';
  }

  // Helper to load image via HTML Image element with crossOrigin
  const loadViaImageElement = () =>
    new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          if (img.naturalWidth > MAX_SOURCE_DIMENSION || img.naturalHeight > MAX_SOURCE_DIMENSION) {
            throw new Error('Image dimensions are too large');
          }
          resolve(drawToDataUrl(img, maxWidth, maxHeight, quality));
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Failed to process image'));
        }
      };

      img.onerror = (err) => {
        reject(err instanceof Error ? err : new Error('Failed to load image'));
      };

      img.src = imageUrl;
    });

  // Helper to load image via fetch blob
  const loadViaFetch = async (): Promise<string> => {
    const res = await fetch(imageUrl, { mode: 'cors' });
    if (!res.ok) throw new Error('Fetch failed');
    const blob = await res.blob();
    if (blob.size > MAX_FILE_SIZE) throw new Error('Image is too large');
    return await compressImageFile(blob, maxWidth, maxHeight, quality);
  };

  try {
    return await withTimeout(loadViaImageElement());
  } catch {
    try {
      return await withTimeout(loadViaFetch());
    } catch {
      return '';
    }
  }
}
