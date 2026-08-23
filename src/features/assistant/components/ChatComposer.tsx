import { useCallback, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useRiverWatch } from '@stball/react-river'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded'
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded'
import MicRoundedIcon from '@mui/icons-material/MicRounded'
import StopRoundedIcon from '@mui/icons-material/StopRounded'
import {
  Alert,
  IconButton,
  InputBase,
  Paper,
  Stack,
  Tooltip,
} from '@mui/material'
import {
  assistantConversationsProvider,
} from '../../../providers'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import { DEFAULT_GEMINI_MODEL, DEFAULT_REASONING_EFFORT, type ReasoningEffort } from '../models'
import type { AssistantAttachment } from '../types'
import { ModelSelector } from './ModelSelector'
import { AttachmentPreviewList } from './AttachmentPreviewList'

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

const handleComposerKeyDown = (event: KeyboardEvent<HTMLDivElement | HTMLTextAreaElement>) => {
  if (event.nativeEvent.isComposing || event.keyCode === 229) return
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    event.currentTarget.closest('form')?.requestSubmit()
  }
}

export function ChatComposer({
  itineraryId,
  threadId,
  inputRef,
  online = true,
  draft,
  onSubmit,
  error: feedbackError = null,
  notice = null,
  onClearError,
  onClearNotice,
}: {
  itineraryId: string
  threadId: string
  inputRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  online?: boolean
  /** 輸入草稿(文字與附件),由容器持有。 */
  draft: {
    text: string
    setText: (text: string) => void
    attachments: AssistantAttachment[]
    addAttachments: (files: File[]) => Promise<void>
    removeAttachment: (id: string) => void
  }
  /** 送出;容器負責清空草稿、建立回合並更新選取。 */
  onSubmit: (payload: {
    text: string
    attachments: AssistantAttachment[]
    selectedModel?: string
    reasoningEffort?: ReasoningEffort
  }) => void
  /** 容器層(載入/清單/附件)的錯誤;turn 內錯誤由對話 snapshot 提供。 */
  error?: string | null
  onClearError: () => void
  /** 系統公告，由 itinerary-scoped River provider 持有。 */
  notice?: string | null
  onClearNotice: () => void
}) {
  const conversationState = useRiverWatch(assistantConversationsProvider({ itineraryId, threadId }))

  const [selectedModel, setSelectedModel] = useStoredPreference<string>(
    'preferred_gemini_model',
    DEFAULT_GEMINI_MODEL,
  )
  const [reasoningEffort, setReasoningEffort] = useStoredPreference<ReasoningEffort>(
    'preferred_gemini_reasoning_effort',
    DEFAULT_REASONING_EFFORT,
  )

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const text = draft.text
  const attachments = draft.attachments

  const turn = conversationState.data?.turn ?? null
  const sending = Boolean(turn)
  const hasPendingProposal = !!turn?.pendingToolCall
  const loading = conversationState.isLoading && !conversationState.hasData
  const unavailable = conversationState.isError && !conversationState.hasData

  const { isListening, error: speechError, clearError: clearSpeechError, toggleListening } =
    useSpeechRecognition({
      onTranscript: (transcript) => {
        draft.setText(draft.text ? `${draft.text} ${transcript}` : transcript)
      },
    })

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files && files.length > 0) {
      void draft.addAttachments(Array.from(files))
    }
    event.target.value = ''
  }

  const canSubmit = (Boolean(text.trim()) || attachments.length > 0) &&
    !loading && !unavailable && !sending && !hasPendingProposal && online

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit({ text, attachments, selectedModel, reasoningEffort })
  }

  const composerPlaceholder = unavailable
    ? '無法載入對話，請切換對話後重試'
    : loading
    ? '正在載入對話…'
    : hasPendingProposal
    ? '請先確認或拒絕待處理的行程提案'
    : '輸入訊息…（Enter 送出，Shift+Enter 換行）'

  const disabled = loading || unavailable || sending || hasPendingProposal || !online
  const error = turn?.error ?? feedbackError

  return (
    <Stack
      component="form"
      onSubmit={handleSubmit}
      sx={{
        px: { xs: 1.25, sm: 2 },
        pt: 0.75,
        pb: { xs: 'max(12px, env(safe-area-inset-bottom))', sm: 2 },
        bgcolor: 'transparent',
        borderTop: 'none',
        zIndex: 3,
      }}
    >
      {/* 網路斷線提示 (輸入框上方) */}
      {!online ? (
        <Alert
          severity="info"
          variant="outlined"
          sx={{ mb: 1, py: 0.25, px: 1.5, fontSize: '0.8rem', borderRadius: 2.5, bgcolor: '#ffffff' }}
        >
          助理與行程確認需要網路連線。
        </Alert>
      ) : null}

      {/* 系統公告 / 提示 (輸入框上方) */}
      {notice ? (
        <Alert
          severity="warning"
          variant="outlined"
          onClose={onClearNotice}
          sx={{ mb: 1, py: 0.25, px: 1.5, fontSize: '0.8rem', borderRadius: 2.5, bgcolor: '#ffffff' }}
        >
          {notice}
        </Alert>
      ) : null}

      {/* 錯誤訊息提示 (輸入框上方) */}
      {error ? (
        <Alert
          severity="error"
          variant="outlined"
          onClose={onClearError}
          sx={{ mb: 1, py: 0.25, px: 1.5, fontSize: '0.8rem', borderRadius: 2.5, bgcolor: '#ffffff' }}
        >
          {error}
        </Alert>
      ) : null}

      {/* 語音錯誤提示 */}
      {speechError ? (
        <Alert
          severity="warning"
          onClose={clearSpeechError}
          sx={{ mb: 1, py: 0.25, px: 1.5, fontSize: '0.78rem', borderRadius: 2.5, bgcolor: '#ffffff' }}
        >
          {speechError}
        </Alert>
      ) : null}

      {/* 整合式現代化輸入卡片 (參考設計) */}
      <Paper
        elevation={0}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          p: { xs: 1.2, sm: 1.4 },
          borderRadius: '24px',
          bgcolor: '#ffffff',
          border: '1px solid rgba(13, 118, 110, 0.16)',
          boxShadow: '0 4px 20px rgba(15, 23, 42, 0.06)',
          transition: 'all 160ms ease',
          '&:focus-within': {
            borderColor: '#0d766e',
            boxShadow: '0 4px 24px rgba(13, 118, 110, 0.14)',
          },
        }}
      >
        {/* 附件預覽 */}
        {attachments.length > 0 ? (
          <AttachmentPreviewList
            attachments={attachments}
            onRemoveAttachment={draft.removeAttachment}
            disabled={disabled}
          />
        ) : null}

        {/* 隱藏的檔案上傳 input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,text/*,.pdf,.md,.csv,.json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* 無邊框文字輸入區 */}
        <InputBase
          inputRef={inputRef}
          fullWidth
          multiline
          minRows={1}
          maxRows={6}
          placeholder={isListening ? '正在聆聽您的語音輸入…' : composerPlaceholder}
          value={text}
          onChange={(event) => draft.setText(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          disabled={disabled}
          sx={{
            px: 0.5,
            py: 0.25,
            fontSize: { xs: '0.92rem', sm: '0.96rem' },
            lineHeight: 1.5,
            '& textarea': {
              padding: 0,
              '&::placeholder': {
                opacity: 0.6,
              },
            },
          }}
        />

        {/* 底部操作欄：左側 [+] [Gemini 模型選單] ； 右側 [🎙️ 麥克風] [▲ 送出] */}
        <Stack
          direction="row"
          sx={{
            justifyContent: 'space-between',
            alignItems: 'center',
            mt: 1,
            pt: 0.25,
          }}
        >
          {/* 左側群組：新增檔案 與 模型選擇器 */}
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Tooltip title="上傳檔案或圖片">
              <span>
                <IconButton
                  size="small"
                  aria-label="上傳檔案或圖片"
                  disabled={disabled}
                  onClick={() => fileInputRef.current?.click()}
                  sx={{
                    width: 30,
                    height: 30,
                    color: 'text.secondary',
                    '&:hover': {
                      color: '#0d766e',
                      bgcolor: 'rgba(13, 118, 110, 0.08)',
                    },
                  }}
                >
                  <AddRoundedIcon sx={{ fontSize: 21 }} />
                </IconButton>
              </span>
            </Tooltip>

            <ModelSelector
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
              reasoningEffort={reasoningEffort ?? 'low'}
              onSelectReasoningEffort={setReasoningEffort}
              disabled={disabled}
              variant="minimal"
            />
          </Stack>

          {/* 右側群組：麥克風 語音輸入 與 送出按鈕 */}
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Tooltip title={isListening ? '停止語音輸入' : '開始語音輸入'}>
              <span>
                <IconButton
                  size="small"
                  aria-label={isListening ? '停止語音輸入' : '開始語音輸入'}
                  disabled={disabled}
                  onClick={toggleListening}
                  sx={{
                    width: 32,
                    height: 32,
                    color: isListening ? '#ffffff' : 'text.secondary',
                    bgcolor: isListening ? '#ef4444' : 'transparent',
                    animation: isListening ? 'assistant-pulse 1.5s infinite' : 'none',
                    '&:hover': {
                      color: isListening ? '#ffffff' : '#0d766e',
                      bgcolor: isListening ? '#dc2626' : 'rgba(13, 118, 110, 0.08)',
                    },
                    '@keyframes assistant-pulse': {
                      '0%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.4)' },
                      '70%': { transform: 'scale(1.06)', boxShadow: '0 0 0 6px rgba(239, 68, 68, 0)' },
                      '100%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(239, 68, 68, 0)' },
                    },
                  }}
                >
                  {isListening ? (
                    <GraphicEqRoundedIcon sx={{ fontSize: 18 }} />
                  ) : (
                    <MicRoundedIcon sx={{ fontSize: 20 }} />
                  )}
                </IconButton>
              </span>
            </Tooltip>

            <IconButton
              type="submit"
              aria-label={sending ? '正在產生回覆' : '送出訊息'}
              disabled={!canSubmit}
              sx={{
                width: 32,
                height: 32,
                bgcolor:
                  !canSubmit
                    ? 'rgba(0, 0, 0, 0.08)'
                    : '#0d766e',
                color: '#ffffff',
                boxShadow:
                  !canSubmit
                    ? 'none'
                    : '0 2px 8px rgba(13, 118, 110, 0.3)',
                transition: 'all 160ms ease',
                '&:hover': {
                  bgcolor: '#075c57',
                  transform: 'scale(1.04)',
                },
                '&.Mui-disabled': {
                  bgcolor: 'action.disabledBackground',
                  color: 'action.disabled',
                },
              }}
            >
              {sending ? (
                <StopRoundedIcon sx={{ fontSize: 16 }} />
              ) : (
                <ArrowUpwardRoundedIcon sx={{ fontSize: 18 }} />
              )}
            </IconButton>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  )
}
