import { useState, type FormEvent, type KeyboardEvent } from 'react'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import {
  Avatar,
  Box,
  Button,
  ButtonBase,
  Card,
  Chip,
  CircularProgress,
  IconButton,
  InputBase,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import type {
  AssistantQuestionData,
  AssistantQuestionDecision,
  AssistantQuestionOption,
} from '../types'

export interface ClarifyingQuestionCardProps {
  questionData: AssistantQuestionData
  busy?: boolean
  online?: boolean
  onAnswer?: (decision: AssistantQuestionDecision) => void
  isHistory?: boolean
  answeredAnswer?: string
}

export function ClarifyingQuestionCard({
  questionData,
  busy = false,
  online = true,
  onAnswer,
  isHistory = false,
  answeredAnswer,
}: ClarifyingQuestionCardProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [customText, setCustomText] = useState('')
  const [submittingOptionId, setSubmittingOptionId] = useState<string | null>(null)

  const isMultiple = Boolean(questionData.multiple)
  const allowCustom = questionData.allowCustomInput !== false

  const handleSelectOption = (option: AssistantQuestionOption) => {
    if (busy || !online) return

    if (isMultiple) {
      setSelectedIds((prev) =>
        prev.includes(option.id) ? prev.filter((id) => id !== option.id) : [...prev, option.id],
      )
    } else {
      setSubmittingOptionId(option.id)
      onAnswer?.({
        selectedOptions: [option.label],
        answer: option.label,
      })
    }
  }

  const handleMultipleSubmit = () => {
    if (busy || !online || selectedIds.length === 0) return
    const chosenOptions = questionData.options
      .filter((opt) => selectedIds.includes(opt.id))
      .map((opt) => opt.label)
    onAnswer?.({
      selectedOptions: chosenOptions,
      answer: chosenOptions.join('、'),
    })
  }

  const handleCustomSubmit = (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = customText.trim()
    if (!trimmed || busy || !online) return
    onAnswer?.({
      customAnswer: trimmed,
      answer: trimmed,
    })
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCustomSubmit()
    }
  }

  // 歷史記錄模式：顯示為已確認之偏好紀錄卡
  if (isHistory || answeredAnswer) {
    return (
      <Card
        variant="outlined"
        sx={{
          borderRadius: 3,
          p: { xs: 1.5, sm: 2 },
          bgcolor: 'rgba(240, 253, 250, 0.65)',
          borderColor: 'rgba(13, 118, 110, 0.18)',
          boxShadow: '0 2px 10px rgba(13, 118, 110, 0.04)',
        }}
      >
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-start' }}>
          <Avatar
            sx={{
              width: 28,
              height: 28,
              bgcolor: 'rgba(13, 118, 110, 0.12)',
              color: '#0d766e',
              flexShrink: 0,
            }}
          >
            <CheckCircleRoundedIcon sx={{ fontSize: 18 }} />
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block' }}>
              先前偏好確認
            </Typography>
            <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a', mt: 0.25 }}>
              {questionData.question}
            </Typography>
            {answeredAnswer ? (
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mt: 0.75, flexWrap: 'wrap' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  你的回答：
                </Typography>
                <Chip
                  size="small"
                  label={answeredAnswer}
                  sx={{
                    bgcolor: '#0d766e',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    height: 24,
                  }}
                />
              </Stack>
            ) : null}
          </Box>
        </Stack>
      </Card>
    )
  }

  // 互動待回答模式
  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 3.5,
        p: { xs: 2, sm: 2.5 },
        bgcolor: '#ffffff',
        borderColor: '#0d766e',
        boxShadow: '0 6px 24px rgba(13, 118, 110, 0.12)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: 'linear-gradient(90deg, #0d766e 0%, #14b8a6 100%)',
        }}
      />

      <Stack spacing={1.75}>
        {/* 卡片標題列 */}
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          <Avatar
            sx={{
              width: 34,
              height: 34,
              background: 'linear-gradient(135deg, #0d766e 0%, #14b8a6 100%)',
              boxShadow: '0 2px 8px rgba(13, 118, 110, 0.25)',
            }}
          >
            <HelpOutlineRoundedIcon sx={{ fontSize: 20, color: '#ffffff' }} />
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '0.94rem', color: '#0d766e', letterSpacing: '-0.01em' }}>
              旅程助理 想先確認你的偏好
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', display: 'block' }}>
              {isMultiple ? '請點選一至多個選項後確認' : '輕點任一選項立即送出，助理將接續規劃'}
            </Typography>
          </Box>
        </Stack>

        {/* 提問主體文字 */}
        <Typography
          sx={{
            fontWeight: 800,
            fontSize: { xs: '1rem', sm: '1.05rem' },
            color: '#0f172a',
            lineHeight: 1.5,
            px: 0.25,
          }}
        >
          {questionData.question}
        </Typography>

        {/* 選項膠囊列表 */}
        <Stack
          direction="row"
          useFlexGap
          spacing={1}
          sx={{
            flexWrap: 'wrap',
            pt: 0.5,
          }}
        >
          {questionData.options.map((option) => {
            const isSelected = isMultiple
              ? selectedIds.includes(option.id)
              : submittingOptionId === option.id
            const isThisSubmitting = submittingOptionId === option.id && busy

            return (
              <ButtonBase
                key={option.id}
                onClick={() => handleSelectOption(option)}
                disabled={busy || !online}
                aria-label={option.label}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 1,
                  px: { xs: 1.5, sm: 2 },
                  py: { xs: 1, sm: 1.25 },
                  borderRadius: 3,
                  border: '1.5px solid',
                  borderColor: isSelected ? '#0d766e' : 'rgba(13, 118, 110, 0.22)',
                  bgcolor: isSelected ? 'rgba(13, 118, 110, 0.08)' : '#ffffff',
                  color: isSelected ? '#0d766e' : '#1e293b',
                  boxShadow: isSelected
                    ? '0 2px 10px rgba(13, 118, 110, 0.15)'
                    : '0 2px 6px rgba(15, 23, 42, 0.04)',
                  transition: 'all 160ms cubic-bezier(0.4, 0, 0.2, 1)',
                  textAlign: 'left',
                  cursor: busy || !online ? 'not-allowed' : 'pointer',
                  '&:hover': {
                    borderColor: '#0d766e',
                    bgcolor: 'rgba(13, 118, 110, 0.06)',
                    transform: 'translateY(-1.5px)',
                    boxShadow: '0 4px 14px rgba(13, 118, 110, 0.18)',
                  },
                  '&:active': {
                    transform: 'scale(0.98)',
                  },
                }}
              >
                {isThisSubmitting ? (
                  <CircularProgress size={16} sx={{ color: '#0d766e', flexShrink: 0 }} />
                ) : isSelected ? (
                  <CheckCircleRoundedIcon sx={{ fontSize: 18, color: '#0d766e', flexShrink: 0 }} />
                ) : null}

                <Box>
                  <Typography
                    component="span"
                    sx={{
                      fontWeight: 750,
                      fontSize: { xs: '0.88rem', sm: '0.92rem' },
                      display: 'block',
                    }}
                  >
                    {option.label}
                  </Typography>
                  {option.description ? (
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.secondary',
                        fontSize: '0.74rem',
                        display: 'block',
                        mt: 0.25,
                      }}
                    >
                      {option.description}
                    </Typography>
                  ) : null}
                </Box>
              </ButtonBase>
            )
          })}
        </Stack>

        {/* 多選確認按鈕 */}
        {isMultiple ? (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 0.5 }}>
            <Button
              variant="contained"
              size="small"
              onClick={handleMultipleSubmit}
              disabled={busy || !online || selectedIds.length === 0}
              startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckCircleRoundedIcon />}
              sx={{
                borderRadius: 2.5,
                bgcolor: '#0d766e',
                fontWeight: 700,
                fontSize: '0.84rem',
                px: 2,
                py: 0.75,
                '&:hover': { bgcolor: '#095953' },
              }}
            >
              確認選擇 {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
            </Button>
          </Box>
        ) : null}

        {/* 自訂回答輸入框 */}
        {allowCustom ? (
          <Paper
            component="form"
            onSubmit={handleCustomSubmit}
            variant="outlined"
            sx={{
              display: 'flex',
              alignItems: 'center',
              px: 1.25,
              py: 0.5,
              borderRadius: 2.5,
              borderColor: 'rgba(13, 118, 110, 0.16)',
              bgcolor: 'rgba(248, 250, 249, 0.8)',
              mt: 0.5,
              '&:focus-within': {
                borderColor: '#0d766e',
                bgcolor: '#ffffff',
              },
            }}
          >
            <InputBase
              fullWidth
              placeholder="或輸入其他偏好想法…"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={busy || !online}
              sx={{
                fontSize: '0.86rem',
                px: 0.5,
              }}
            />
            <IconButton
              size="small"
              type="submit"
              aria-label="送出自訂回答"
              disabled={busy || !online || !customText.trim()}
              sx={{
                width: 28,
                height: 28,
                color: customText.trim() ? '#ffffff' : 'text.disabled',
                bgcolor: customText.trim() ? '#0d766e' : 'transparent',
                '&:hover': {
                  bgcolor: customText.trim() ? '#095953' : 'transparent',
                },
              }}
            >
              <SendRoundedIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Paper>
        ) : null}
      </Stack>
    </Card>
  )
}
