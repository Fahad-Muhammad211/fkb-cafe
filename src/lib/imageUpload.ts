// Turns an uploaded image into a small JPEG data URL that fits comfortably in localStorage.
// Images are scaled so the longest side is at most MAX_SIDE pixels.

const MAX_SIDE = 800;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_DATA_URL_CHARS = 350_000;

export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    img.src = url;
  });
}

export async function imageFileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (PNG, JPG, WebP or GIF).");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("Choose an image under 8 MB.");

  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot process images.");
  ctx.fillStyle = "#18181b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.85, 0.7, 0.55]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= MAX_DATA_URL_CHARS) return dataUrl;
  }
  throw new Error("That image is too detailed to store. Try a smaller image.");
}

// Accepts https links and image data URLs; anything else is rejected.
export function isAllowedImageUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (v.startsWith("data:image/")) return true;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}
