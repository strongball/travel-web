import { useCallback, useEffect, useRef, useState } from 'react'

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message?: string
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => void) | null
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void) | null
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

const getSpeechRecognitionClass = (): SpeechRecognitionConstructor | null => {
  if (typeof window === 'undefined') return null
  return (
    window.SpeechRecognition ||
    window.webkitSpeechRecognition ||
    ((window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor })
      .webkitSpeechRecognition ?? null)
  )
}

export function useSpeechRecognition({
  onTranscript,
}: {
  onTranscript: (transcript: string) => void
}) {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript

  const isSupported = typeof window !== 'undefined' && getSpeechRecognitionClass() !== null

  useEffect(() => {
    const SpeechRec = getSpeechRecognitionClass()
    if (!SpeechRec) return

    try {
      const recognition = new SpeechRec()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = navigator.language || 'zh-TW'

      recognition.onstart = () => {
        setIsListening(true)
        setError(null)
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognition.onerror = (event) => {
        if (event.error === 'no-speech') return
        if (event.error === 'not-allowed') {
          setError('請允許瀏覽器麥克風權限以進行語音輸入')
        } else {
          setError(`語音辨識發生錯誤：${event.error}`)
        }
        setIsListening(false)
      }

      recognition.onresult = (event) => {
        let finalTranscript = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result && result.isFinal) {
            finalTranscript += result[0]?.transcript || ''
          }
        }
        if (finalTranscript) {
          onTranscriptRef.current(finalTranscript)
        }
      }

      recognitionRef.current = recognition
    } catch (initErr) {
      console.warn('SpeechRecognition initialization failed', initErr)
    }

    return () => {
      try {
        recognitionRef.current?.abort()
      } catch {
        // ignore abort errors
      }
    }
  }, [])

  const startListening = useCallback(() => {
    const SpeechRec = getSpeechRecognitionClass()
    if (!SpeechRec) {
      setError('當前瀏覽器不支援語音辨識，建議使用 Chrome、Edge 或 Safari。')
      return
    }
    setError(null)
    try {
      if (!recognitionRef.current) {
        const recognition = new SpeechRec()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = navigator.language || 'zh-TW'
        recognition.onstart = () => setIsListening(true)
        recognition.onend = () => setIsListening(false)
        recognition.onerror = (event) => {
          if (event.error !== 'no-speech') {
            setError(event.error === 'not-allowed' ? '請允許麥克風權限' : `語音錯誤：${event.error}`)
          }
          setIsListening(false)
        }
        recognition.onresult = (event) => {
          let finalTranscript = ''
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i]
            if (result && result.isFinal) {
              finalTranscript += result[0]?.transcript || ''
            }
          }
          if (finalTranscript) {
            onTranscriptRef.current(finalTranscript)
          }
        }
        recognitionRef.current = recognition
      }
      recognitionRef.current.start()
    } catch {
      // Recognition may already be active
    }
  }, [])

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return
    try {
      recognitionRef.current.stop()
    } catch {
      // ignore stop errors
    }
    setIsListening(false)
  }, [])

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }, [isListening, startListening, stopListening])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    isListening,
    isSupported,
    error,
    clearError,
    startListening,
    stopListening,
    toggleListening,
  }
}
