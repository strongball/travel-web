import type { AssistantAttachment } from './types'

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024

const readFile = (file: File, mode: 'data-url' | 'text') => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result as string)
  reader.onerror = () => reject(reader.error ?? new Error(`無法讀取檔案「${file.name}」`))
  if (mode === 'text') reader.readAsText(file)
  else reader.readAsDataURL(file)
})

const isTextFile = (file: File) => {
  const name = file.name.toLowerCase()
  return file.type.startsWith('text/') ||
    ['.txt', '.md', '.csv', '.json'].some((extension) => name.endsWith(extension))
}

/** 讀取檔案為附件;超出大小或讀取失敗的檔案回報在 errors。 */
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
    let content: string
    try {
      content = await readFile(file, textFile ? 'text' : 'data-url')
    } catch (readError) {
      errors.push(readError instanceof Error ? readError.message : `無法讀取檔案「${file.name}」`)
      continue
    }
    attachments.push({
      id: crypto.randomUUID(),
      name: file.name,
      mimeType: file.type || (textFile ? 'text/plain' : 'application/octet-stream'),
      size: file.size,
      ...(textFile ? { textContent: content } : { dataUrl: content }),
    })
  }
  return { attachments, errors }
}
