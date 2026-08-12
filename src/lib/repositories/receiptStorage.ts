import { imageBucket, storageObjectPath, storageReference } from '../imageReference'
import { supabase } from '../supabase'

const extensionFor = (file: File) => {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

export const uploadReceiptImages = async (files: File[]): Promise<string[]> => {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('請先登入')
  const uploaded: string[] = []
  try {
    for (const file of files) {
      const path = `${data.user.id}/${crypto.randomUUID()}.${extensionFor(file)}`
      const { error } = await supabase.storage.from(imageBucket).upload(path, file, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      })
      if (error) throw error
      uploaded.push(path)
    }
    return uploaded.map(storageReference)
  } catch (error) {
    if (uploaded.length > 0) await supabase.storage.from(imageBucket).remove(uploaded)
    throw error
  }
}

export const deleteReceiptImages = async (references: string[]) => {
  const paths = references.map(storageObjectPath).filter((path): path is string => Boolean(path))
  if (paths.length === 0) return
  const { error } = await supabase.storage.from(imageBucket).remove(paths)
  if (error) throw error
}

export const signedReceiptUrl = async (reference: string) => {
  const path = storageObjectPath(reference)
  if (!path) return reference
  const { data, error } = await supabase.storage.from(imageBucket).createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}

export const downloadReceiptFiles = async (references: string[]): Promise<File[]> => {
  const files: File[] = []
  for (const [index, reference] of references.entries()) {
    const path = storageObjectPath(reference)
    if (!path) throw new Error('無法讀取舊版收據圖片，請重新選擇照片')
    const { data, error } = await supabase.storage.from(imageBucket).download(path)
    if (error) throw error
    files.push(new File([data], `receipt-${index + 1}`, { type: data.type || 'image/jpeg' }))
  }
  return files
}
