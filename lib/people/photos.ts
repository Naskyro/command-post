import type { FinRecord, Viewer } from '../finance/model';
import { hrActions, hrCan } from '../hr/permissions.ts';
import { AppError } from '../shared/errors.ts';

export const profilePhotoLimit = 5 * 1024 * 1024;
export const profilePhotoCategory = 'Profile Photo';
export const photoRecordId = (personId: string) => 'hrphoto:' + personId;

export function canReadProfilePhoto(viewer: Viewer, personId: string, records: FinRecord[]) {
  if (!records.some(r => r.kind === 'person' && r.id === personId)) return false;
  if (viewer.person === personId) return true;
  if (viewer.onboardingOnly) return false;
  return Object.keys(hrActions).some(action => hrCan(viewer, action, personId, records));
}

export function canEditProfilePhoto(viewer: Viewer, personId: string, records: FinRecord[]) {
  if (!records.some(r => r.kind === 'person' && r.id === personId)) return false;
  return viewer.person === personId || !viewer.onboardingOnly && ['managePersonnel', 'manageOnboarding'].some(action => hrCan(viewer, action, personId, records));
}

function join(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
const ascii = (bytes: Uint8Array, from: number, length: number) => String.fromCharCode(...bytes.slice(from, from + length));
function dimensions(width: number, height: number) {
  if (width < 16 || height < 16 || width > 8192 || height > 8192 || width * height > 24_000_000) throw new AppError('Choose a photo between 16 and 8,192 pixels per side, up to 24 megapixels.');
}
function invalid(): never { throw new AppError('This file is not a supported photo. Choose a valid JPG, PNG, or WebP image.'); }

/** Verify container signatures and dimensions, and remove EXIF, text, comments, and other metadata. */
export function prepareProfilePhoto(bytes: Uint8Array, declaredType: string, sizeLimit=profilePhotoLimit): { bytes: Uint8Array; mimeType: string; width: number; height: number } {
  if (!bytes.length || bytes.length > Math.min(15*1024*1024,sizeLimit)) throw new AppError(`Choose a photo smaller than ${Math.min(15,sizeLimit/(1024*1024))} MB.`);
  let mimeType = '', width = 0, height = 0, clean: Uint8Array;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    mimeType = 'image/jpeg';
    const parts = [bytes.slice(0, 2)];
    let offset = 2, foundScan = false, foundEnd = false, frameCount = 0;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff || offset + 1 >= bytes.length) invalid();
      const start = offset;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9) { parts.push(new Uint8Array([0xff, 0xd9])); foundEnd = true; break; }
      if (offset + 1 >= bytes.length) invalid();
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) invalid();
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (length < 8 || ++frameCount !== 1) invalid();
        height = (bytes[offset + 3] << 8) | bytes[offset + 4]; width = (bytes[offset + 5] << 8) | bytes[offset + 6];
        dimensions(width, height);
      }
      if (marker === 0xda) {
        // Scan to the next real marker; byte stuffing and restart markers stay in image data.
        // Progressive JPEGs may have several scans with metadata between them.
        let end = offset + length;
        while (end + 1 < bytes.length) {
          if (bytes[end] !== 0xff) { end++; continue; }
          const next = bytes[end + 1];
          if (next === 0 || next >= 0xd0 && next <= 0xd7) { end += 2; continue; }
          if (next === 0xff) { end++; continue; }
          break;
        }
        if (end + 1 >= bytes.length) invalid();
        parts.push(bytes.slice(start, end)); foundScan = true; offset = end; continue;
      }
      if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe) parts.push(bytes.slice(start, offset + length));
      offset += length;
    }
    if (!foundScan || !foundEnd || frameCount !== 1) invalid();
    clean = join(parts);
  } else if (bytes.length >= 33 && bytes.slice(0, 8).every((b, i) => b === [137, 80, 78, 71, 13, 10, 26, 10][i])) {
    mimeType = 'image/png';
    const parts = [bytes.slice(0, 8)], view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 8, foundEnd = false, foundData = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset), type = ascii(bytes, offset + 4, 4), end = offset + 12 + length;
      if (end > bytes.length || length > sizeLimit) invalid();
      if (offset === 8 && (type !== 'IHDR' || length !== 13)) invalid();
      if (type === 'IHDR') { if (offset !== 8) invalid(); width = view.getUint32(offset + 8); height = view.getUint32(offset + 12); dimensions(width, height); }
      if (type === 'IDAT') foundData = true;
      if (['acTL', 'fcTL', 'fdAT'].includes(type)) throw new AppError('Choose a still photo instead of an animated image.');
      // Keep only the image/color data needed for correct rendering.
      if (['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB'].includes(type)) parts.push(bytes.slice(offset, end));
      if (type === 'IEND') { if (length !== 0) invalid(); foundEnd = true; break; }
      offset = end;
    }
    if (!foundEnd || !foundData) invalid();
    clean = join(parts);
  } else if (bytes.length >= 30 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    mimeType = 'image/webp';
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), parts: Uint8Array[] = [];
    const declaredLength = view.getUint32(4, true) + 8;
    if (declaredLength > bytes.length || declaredLength < 20) invalid();
    let offset = 12, foundImage = false, hasExtendedHeader = false;
    while (offset + 8 <= declaredLength) {
      const type = ascii(bytes, offset, 4), length = view.getUint32(offset + 4, true), end = offset + 8 + length + (length % 2);
      if (end > declaredLength) invalid();
      const data = offset + 8;
      if (type === 'ANIM' || type === 'ANMF') throw new AppError('Choose a still photo instead of an animated image.');
      if (type === 'VP8X') {
        if (length !== 10 || bytes[data] & 0x02 || offset !== 12 || hasExtendedHeader) invalid();
        hasExtendedHeader = true;
        width = 1 + bytes[data + 4] + (bytes[data + 5] << 8) + (bytes[data + 6] << 16);
        height = 1 + bytes[data + 7] + (bytes[data + 8] << 8) + (bytes[data + 9] << 16);
        dimensions(width, height);
        const chunk = bytes.slice(offset, end); chunk[8] &= ~(0x08 | 0x04); parts.push(chunk);
      } else if (type === 'VP8 ') {
        if (length < 10 || foundImage || bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a) invalid();
        const frameWidth = view.getUint16(data + 6, true) & 0x3fff, frameHeight = view.getUint16(data + 8, true) & 0x3fff;
        if (hasExtendedHeader && (width !== frameWidth || height !== frameHeight)) invalid();
        width = frameWidth; height = frameHeight; dimensions(width, height);
        foundImage = true; parts.push(bytes.slice(offset, end));
      } else if (type === 'VP8L') {
        if (length < 5 || foundImage || bytes[data] !== 0x2f) invalid();
        const bits = view.getUint32(data + 1, true), frameWidth = (bits & 0x3fff) + 1, frameHeight = ((bits >>> 14) & 0x3fff) + 1;
        if (hasExtendedHeader && (width !== frameWidth || height !== frameHeight)) invalid();
        width = frameWidth; height = frameHeight; dimensions(width, height);
        foundImage = true; parts.push(bytes.slice(offset, end));
      } else if (['ALPH', 'ICCP'].includes(type)) parts.push(bytes.slice(offset, end));
      offset = end;
    }
    if (!foundImage || offset !== declaredLength) invalid();
    const body = join(parts), header = bytes.slice(0, 12);
    new DataView(header.buffer, header.byteOffset, header.byteLength).setUint32(4, body.length + 4, true);
    clean = join([header, body]);
  } else invalid();
  if (declaredType && declaredType !== mimeType) throw new AppError('The photo contents do not match its file type. Choose a JPG, PNG, or WebP image.');
  dimensions(width, height);
  return { bytes: clean, mimeType, width, height };
}
