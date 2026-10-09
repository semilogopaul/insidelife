import { CHAT_IMAGE_MAX_EDGE } from '@insidelife/shared';

/**
 * Shrink a picked photo before upload: longest edge ≤1600 px, JPEG, orientation applied, metadata (GPS!) dropped by
 * the re-draw. A 12 MP phone photo goes from ~4 MB to ~300 KB, which matters on mobile data. The server re-checks
 * and re-encodes anyway.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, CHAT_IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Could not encode the photo');
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}
