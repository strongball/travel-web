import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_REASONING_EFFORT,
  type ReasoningEffort,
} from '../models'
import type { AssistantAttachment } from '../types'

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024

function useStoredPreference<T extends string>(key: string, fallback: T) {
  const [value, setValueState] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T | null) ?? fallback
    } catch {
      return fallback
    }
  })

  const setValue = useCallback((nextValue: T) => {
    setValueState(nextValue)
    try {
      localStorage.setItem(key, nextValue)
    } catch {
      // The preference still applies for this page session.
    }
  }, [key])

  return [value, setValue] as const
}

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

export function useAssistantComposerState(
  setError: Dispatch<SetStateAction<string | null>>,
) {
  const [selectedModel, setSelectedModel] = useStoredPreference<string>(
    'preferred_gemini_model',
    DEFAULT_GEMINI_MODEL,
  )
  const [reasoningEffort, setReasoningEffort] = useStoredPreference<ReasoningEffort>(
    'preferred_gemini_reasoning_effort',
    DEFAULT_REASONING_EFFORT,
  )
  const [attachments, setAttachments] = useState<AssistantAttachment[]>([])
  const attachmentGenerationRef = useRef(0)

  const addAttachments = useCallback(async (files: File[]) => {
    const generation = attachmentGenerationRef.current
    const nextAttachments: AssistantAttachment[] = []
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_SIZE) {
        setError(`檔案「${file.name}」超過 10MB 大小限制`)
        continue
      }

      const textFile = isTextFile(file)
      let content: string
      try {
        content = await readFile(file, textFile ? 'text' : 'data-url')
      } catch (readError) {
        if (generation === attachmentGenerationRef.current) {
          setError(readError instanceof Error ? readError.message : `無法讀取檔案「${file.name}」`)
        }
        continue
      }
      nextAttachments.push({
        id: crypto.randomUUID(),
        name: file.name,
        mimeType: file.type || (textFile ? 'text/plain' : 'application/octet-stream'),
        size: file.size,
        ...(textFile ? { textContent: content } : { dataUrl: content }),
      })
    }
    if (generation === attachmentGenerationRef.current && nextAttachments.length > 0) {
      setAttachments((current) => [...current, ...nextAttachments])
    }
  }, [setError])

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id))
  }, [])

  const clearAttachments = useCallback(() => {
    attachmentGenerationRef.current += 1
    setAttachments([])
  }, [])

  return {
    selectedModel,
    setSelectedModel,
    reasoningEffort,
    setReasoningEffort,
    attachments,
    addAttachments,
    removeAttachment,
    clearAttachments,
  }
}
