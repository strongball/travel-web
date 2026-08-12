import imageCompression from 'browser-image-compression'

import type { ReceiptImageInput } from '../types/receipt'

export const maxReceiptImages = 5
export const maxReceiptBytes = 14 * 1024 * 1024

const toBase64 = async (blob: Blob): Promise<string> => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Cannot read image'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
  const separator = dataUrl.indexOf(',')
  if (separator < 0) throw new Error('Invalid image data')
  return dataUrl.slice(separator + 1)
}

export const compressReceiptImages = async (
  files: File[],
): Promise<ReceiptImageInput[]> => {
  if (files.length === 0) throw new Error('請先加入收據照片')
  if (files.length > maxReceiptImages) {
    throw new Error(`一次最多掃描 ${maxReceiptImages} 張照片`)
  }

  let totalBytes = 0
  const images: ReceiptImageInput[] = []
  for (const file of files) {
    if (!file.type.startsWith('image/')) throw new Error('只支援圖片檔案')
    const compressed = await imageCompression(file, {
      maxWidthOrHeight: 2000,
      initialQuality: 0.8,
      fileType: 'image/jpeg',
      useWebWorker: true,
    })
    totalBytes += compressed.size
    if (totalBytes > maxReceiptBytes) {
      throw new Error('收據照片合計超過 14 MiB，請減少張數或重新拍攝')
    }
    images.push({ mimeType: 'image/jpeg', data: await toBase64(compressed) })
  }
  return images
}
