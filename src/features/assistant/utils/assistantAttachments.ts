import type { AssistantAttachment } from '../types'

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 1600
const IMAGE_QUALITY = 0.82

const readFile = (file: File, mode: 'data-url' | 'text') =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error(`無法讀取檔案「${file.name}」`))
    if (mode === 'text') reader.readAsText(file)
    else reader.readAsDataURL(file)
  })

const isTextFile = (file: File) => {
  const name = file.name.toLowerCase()
  return (
    file.type.startsWith('text/') ||
    ['.txt', '.md', '.csv', '.json'].some((extension) => name.endsWith(extension))
  )
}

const isImageFile = (file: File) => {
  const name = file.name.toLowerCase()
  return (
    file.type.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].some((extension) =>
      name.endsWith(extension),
    )
  )
}

const compressImage = async (file: File): Promise<{ dataUrl: string; size: number }> => {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    const rawDataUrl = await readFile(file, 'data-url')
    return { dataUrl: rawDataUrl, size: file.size }
  }

  return new Promise((resolve) => {
    let resolved = false
    const fallback = () => {
      if (resolved) return
      resolved = true
      void readFile(file, 'data-url').then((dataUrl) => resolve({ dataUrl, size: file.size }))
    }

    const timer = setTimeout(fallback, 1500)

    try {
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)

      img.onload = () => {
        if (resolved) return
        clearTimeout(timer)
        resolved = true
        URL.revokeObjectURL(objectUrl)
        let { width, height } = img
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_IMAGE_DIMENSION) / width)
            width = MAX_IMAGE_DIMENSION
          } else {
            width = Math.round((width * MAX_IMAGE_DIMENSION) / height)
            height = MAX_IMAGE_DIMENSION
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          fallback()
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        const mimeType = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg'
        const dataUrl = canvas.toDataURL(mimeType, IMAGE_QUALITY)
        const approxBytes = Math.round((dataUrl.length * 3) / 4)
        resolve({ dataUrl, size: approxBytes })
      }

      img.onerror = () => {
        clearTimeout(timer)
        URL.revokeObjectURL(objectUrl)
        fallback()
      }

      img.src = objectUrl
    } catch {
      clearTimeout(timer)
      fallback()
    }
  })
}

/** 讀取檔案為附件；圖片會自動進行縮圖與品質壓縮，超出大小或讀取失敗回報於 errors。 */
export const readAssistantAttachments = async (
  files: File[],
): Promise<{ attachments: AssistantAttachment[]; errors: string[] }> => {
  const attachments: AssistantAttachment[] = []
  const errors: string[] = []

  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_SIZE) {
      errors.push(`檔案「${file.name}」超過 10MB 大小限制`)
      continue
    }

    const textFile = isTextFile(file)
    const imageFile = isImageFile(file)

    try {
      if (textFile) {
        const content = await readFile(file, 'text')
        attachments.push({
          id: crypto.randomUUID(),
          name: file.name,
          mimeType: file.type || 'text/plain',
          size: file.size,
          textContent: content,
        })
      } else if (imageFile) {
        const { dataUrl, size } = await compressImage(file)
        attachments.push({
          id: crypto.randomUUID(),
          name: file.name,
          mimeType: file.type || 'image/jpeg',
          size,
          dataUrl,
        })
      } else {
        const dataUrl = await readFile(file, 'data-url')
        attachments.push({
          id: crypto.randomUUID(),
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl,
        })
      }
    } catch (readError) {
      errors.push(readError instanceof Error ? readError.message : `無法讀取檔案「${file.name}」`)
    }
  }

  return { attachments, errors }
}
