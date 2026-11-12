/*
  compress-image.js
  -------------------
  Resizes and re-compresses an uploaded image before it's turned into a
  base64 data URI. Without this, a phone photo (often 3000x4000px, several
  MB) gets embedded as-is into every data.json, every preview render, and
  every downloaded zip — making everything slow and, in practice, making
  "Live preview" look broken since the browser has to parse a multi-megabyte
  inline script just to show a thumbnail-sized photo.

  Usage (drop-in replacement for the old fileToDataUri pattern):

    const dataUri = await compressImageToDataUri(file, { maxDim: 500, quality: 0.82 });

  Typical result: a 2-4MB phone photo becomes ~30-80KB — small enough that
  preview and download stay fast regardless of connection speed.
*/

function compressImageToDataUri(file, { maxDim = 500, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      img.onload = () => {
        let { width, height } = img;

        if (width > height && width > maxDim) {
          height = Math.round(height * (maxDim / width));
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round(width * (maxDim / height));
          height = maxDim;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // JPEG output regardless of input format — much smaller than PNG
        // for photographs, and every browser/template can display it.
        const dataUri = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUri);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
