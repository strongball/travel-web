import type { AssistantAttachment } from '../types'

export type AssistantDraft = { text: string; attachments: AssistantAttachment[] }
export const emptyAssistantDraft = (): AssistantDraft => ({ text: '', attachments: [] })
let databasePromise: Promise<IDBDatabase> | undefined

const database = () => {
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('travel-assistant-drafts', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('drafts')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { databasePromise = undefined; reject(request.error) }
  })
  return databasePromise
}

const readStoredDraft = (value: unknown): AssistantDraft => {
  if (!value || typeof value !== 'object') return emptyAssistantDraft()
  const draft = value as Partial<AssistantDraft>
  return {
    text: typeof draft.text === 'string' ? draft.text : '',
    attachments: Array.isArray(draft.attachments) ? draft.attachments.filter((file) =>
      file && typeof file.id === 'string' && typeof file.name === 'string' &&
      typeof file.mimeType === 'string' && typeof file.size === 'number') : [],
  }
}

export async function loadAssistantDraft(key: string): Promise<AssistantDraft> {
  if (typeof indexedDB === 'undefined') {
    return readStoredDraft(JSON.parse(localStorage.getItem(`assistant-draft:${key}`) ?? 'null'))
  }
  const db = await database()
  return new Promise((resolve, reject) => {
    const request = db.transaction('drafts').objectStore('drafts').get(key)
    request.onsuccess = () => resolve(readStoredDraft(request.result))
    request.onerror = () => reject(request.error)
  })
}

export async function saveAssistantDraft(key: string, draft: AssistantDraft): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    if (draft.text || draft.attachments.length) localStorage.setItem(`assistant-draft:${key}`, JSON.stringify(draft))
    else localStorage.removeItem(`assistant-draft:${key}`)
    return
  }
  const db = await database()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('drafts', 'readwrite')
    const store = transaction.objectStore('drafts')
    if (draft.text || draft.attachments.length) store.put(draft, key)
    else store.delete(key)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}
