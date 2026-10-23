const UNREADABLE = 'That photo couldn’t be read. Try a JPEG or PNG.'

/** Centre-crops to a square JPEG. Re-encoding through a canvas also drops EXIF metadata such as GPS location. */
export async function toSquareJpeg(file: Blob, size = 320, quality = 0.86): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(UNREADABLE)
  }
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(UNREADABLE)
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
  bitmap.close()
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(UNREADABLE))), 'image/jpeg', quality))
}
