/**
 * Compresses an uploaded image file on the client using HTML5 Canvas.
 * Scales the image while preserving aspect ratio and outputs a lightweight Base64 data URL.
 *
 * @param {File} file - The uploaded image file
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

    if (!file.type.startsWith('image/')) {
      return reject(new Error('Selected file is not an image'));
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
