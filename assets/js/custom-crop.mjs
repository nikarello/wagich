// Source-pixel coordinates are shared by the editor, mockup and PNG export.
export const RATIO = 13 / 16;
export const MAX_ZOOM = 4;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function cropRect(width, height, zoom = 1, centerX = width / 2, centerY = height / 2) {
  const baseWidth = Math.min(width, height * RATIO);
  const cropWidth = baseWidth / clamp(zoom, 1, MAX_ZOOM);
  const cropHeight = cropWidth / RATIO;
  const x = clamp(centerX - cropWidth / 2, 0, Math.max(0, width - cropWidth));
  const y = clamp(centerY - cropHeight / 2, 0, Math.max(0, height - cropHeight));
  return { x, y, width: cropWidth, height: cropHeight, centerX: x + cropWidth / 2, centerY: y + cropHeight / 2 };
}

export function exportSize(rect) {
  // Exact 13:16 output; never enlarge the selected source area.
  const units = Math.max(1, Math.floor(Math.min(rect.width / 13, rect.height / 16, 200)));
  return { width: units * 13, height: units * 16 };
}

export function imageFormat(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return "png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "webp";
  return null;
}
