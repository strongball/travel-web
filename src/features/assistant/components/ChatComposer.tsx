import SendRoundedIcon from '@mui/icons-material/SendRounded'
import {
  IconButton,
  InputAdornment,
  Stack,
  TextField,
} from '@mui/material'
import type { FormEvent, KeyboardEvent } from 'react'

const handleComposerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
  if (event.nativeEvent.isComposing || event.keyCode === 229) return
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    event.currentTarget.closest('form')?.requestSubmit()
  }
}

export function ChatComposer({
  text,
  onChangeText,
  onSubmit,
  disabled,
  placeholder,
  sending,
  inputRef,
}: {
  text: string
  onChangeText: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  disabled: boolean
  placeholder: string
  sending: boolean
  inputRef?: React.Ref<HTMLInputElement | HTMLTextAreaElement>
}) {
  return (
    <Stack
      component="form"
      onSubmit={onSubmit}
      sx={{
        p: { xs: 1.25, sm: 1.75 },
        pb: { xs: 'max(14px, env(safe-area-inset-bottom))', sm: 1.75 },
        borderTop: '1px solid rgba(13, 118, 110, 0.1)',
        bgcolor: 'rgba(255, 255, 255, 0.94)',
        backdropFilter: 'blur(16px)',
        zIndex: 3,
      }}
    >
      <TextField
        inputRef={inputRef}
        fullWidth
        variant="outlined"
        multiline
        minRows={1}
        maxRows={5}
        placeholder={placeholder}
        value={text}
        onChange={(event) => onChangeText(event.target.value)}
        onKeyDown={handleComposerKeyDown}
        disabled={disabled}
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end" sx={{ mb: 0.5 }}>
                <IconButton
                  type="submit"
                  aria-label="送出訊息"
                  disabled={!text.trim() || disabled}
                  edge="end"
                  sx={{
                    width: 42,
                    height: 42,
                    background:
                      !text.trim() || sending
                        ? 'rgba(0, 0, 0, 0.08)'
                        : 'linear-gradient(135deg, #0d766e 0%, #14b8a6 100%)',
                    color: '#ffffff',
                    boxShadow:
                      !text.trim() || sending
                        ? 'none'
                        : '0 3px 12px rgba(13, 118, 110, 0.3)',
                    transition: 'all 180ms ease',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #075c57 0%, #0d766e 100%)',
                      transform: 'scale(1.04)',
                    },
                    '&.Mui-disabled': {
                      bgcolor: 'action.disabledBackground',
                      color: 'action.disabled',
                    },
                  }}
                >
                  <SendRoundedIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
            sx: {
              borderRadius: 3.5,
              bgcolor: '#f1f5f4',
              alignItems: 'flex-end',
              py: 0.75,
              px: 1.5,
              border: '1px solid rgba(13, 118, 110, 0.12)',
              transition: 'border-color 160ms ease, box-shadow 160ms ease',
              '&:hover': {
                borderColor: '#0d766e',
              },
              '&.Mui-focused': {
                borderColor: '#0d766e',
                bgcolor: '#ffffff',
                boxShadow: '0 0 0 3px rgba(13, 118, 110, 0.15)',
              },
              '& textarea': {
                padding: '6px 4px',
                fontSize: { xs: '0.92rem', sm: '0.96rem' },
                lineHeight: 1.5,
              },
            },
          },
        }}
      />
    </Stack>
  )
}
