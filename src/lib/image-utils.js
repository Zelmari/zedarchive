const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_SOURCE_DIMENSION = 4000; // guard against decompression bombs
const FETCH_TIMEOUT_MS = 10000;

function withTimeout(promise, ms = FETCH_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Image load timed out')), ms)
    ),
  ]);
}

/**
 * Compresses an uploaded image file on the client using HTML5 Canvas.
 * Scales the image while preserving aspect ratio and outputs a lightweight Base64 data URL.
 *
 * @param {File|Blob} file - The uploaded image file or blob
 * @param {number} maxWidth - Maximum width (default: 320)
 * @param {number} maxHeight - Maximum height (default: 480)
 * @param {number} quality - Compression quality between 0 and 1 (default: 0.7)
 * @returns {Promise<string>} Base64 data URL
 */
export function compressImageFile(file, maxWidth = 320, maxHeight = 480, quality = 0.7) {
  return new Promise((resolve, reject) => {
    if (!file) {
      return reject(new Error('No file provided'));
    }

    if (file.type && !file.type.startsWith('image/')) {
      return reject(new Error('Selected file is not an image'));
    }

    if (file.size > MAX_FILE_SIZE) {
      return reject(new Error('Image is too large (max 10 MB)'));
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
          return reject(new Error('Image dimensions are too large'));
        }

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
          return reject(new Error('Could not get canvas context'));
        }

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Try webp compression first
        let dataUrl = canvas.toDataURL('image/webp', quality);

        // Fallback to jpeg if webp isn't supported
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(dataUrl);
      };

      img.src = event.target.result;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Fetches a remote image URL, renders it onto an HTML5 Canvas to scale and compress,
 * and returns a lightweight Base64 data URL.
 * Falls back gracefully on CORS or network failures.
 *
 * @param {string} imageUrl - The remote image URL
 * @param {number} maxWidth - Maximum width (default: 320)
 * @param {number} maxHeight - Maximum height (default: 480)
 * @param {number} quality - Compression quality between 0 and 1 (default: 0.7)
 * @returns {Promise<string>} Base64 data URL or empty string on failure
 */
export async function fetchAndCompressRemoteImage(
  imageUrl,
  maxWidth = 320,
  maxHeight = 480,
  quality = 0.7
) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return '';
  }

  // Only allow http(s) URLs — never data: or file: schemes
  if (!/^https?:\/\//i.test(imageUrl)) {
    return '';
  }

  // Helper to load image via HTML Image element with crossOrigin
  const loadViaImageElement = () =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          if (img.naturalWidth > MAX_SOURCE_DIMENSION || img.naturalHeight > MAX_SOURCE_DIMENSION) {
            return reject(new Error('Image dimensions are too large'));
          }

          let { width, height } = img;

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
            return reject(new Error('No canvas context'));
          }

          ctx.drawImage(img, 0, 0, width, height);

          let dataUrl = canvas.toDataURL('image/webp', quality);
          if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }

          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = (err) => {
        reject(err);
      };

      img.src = imageUrl;
    });

  // Helper to load image via fetch blob
  const loadViaFetch = async () => {
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
