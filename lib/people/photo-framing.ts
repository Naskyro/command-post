export const photoOutputSize = 512;

const clamp = (n: number, lower: number, upper: number) => Math.min(upper, Math.max(lower, n));

// Coordinates are in the EXIF-oriented source bitmap. 0 is the first legal
// crop, 50 is centered, and 100 is the last crop with no exposed background.
export function photoCrop(width: number, height: number, zoom: number, horizontal: number, vertical: number) {
  const side = Math.min(width, height) / clamp(zoom, 1, 2.5);
  return {
    x: (width - side) * (clamp(horizontal, 0, 100) / 100),
    y: (height - side) * (clamp(vertical, 0, 100) / 100),
    side,
  };
}

export function drawProfilePhoto(ctx: CanvasRenderingContext2D, image: ImageBitmap, zoom: number, horizontal: number, vertical: number) {
  const { x, y, side } = photoCrop(image.width, image.height, zoom, horizontal, vertical);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, photoOutputSize, photoOutputSize);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, x, y, side, side, 0, 0, photoOutputSize, photoOutputSize);
}
