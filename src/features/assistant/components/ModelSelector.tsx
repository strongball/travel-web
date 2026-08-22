import { useState } from 'react'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded'
import {
  Box,
  ButtonBase,
  Chip,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material'
import {
  GEMINI_MODELS,
  REASONING_EFFORTS,
  type GeminiModelOption,
  type ReasoningEffort,
  type ReasoningEffortOption,
} from '../models'

interface ModelSelectorProps {
  selectedModel: string
  onSelectModel: (modelId: string) => void
  reasoningEffort: ReasoningEffort
  onSelectReasoningEffort: (effort: ReasoningEffort) => void
  disabled?: boolean
  size?: 'small' | 'medium'
  variant?: 'pill' | 'minimal'
}

type MenuStep = 'model' | 'effort'

export function ModelSelector({
  selectedModel,
  onSelectModel,
  reasoningEffort,
  onSelectReasoningEffort,
  disabled = false,
  size = 'small',
  variant = 'pill',
}: ModelSelectorProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [step, setStep] = useState<MenuStep>('model')
  const [pendingModel, setPendingModel] = useState<GeminiModelOption | null>(null)
  const open = Boolean(anchorEl)

  const currentModel =
    GEMINI_MODELS.find((m) => m.id === selectedModel) ?? GEMINI_MODELS[0]
  const currentEffort =
    REASONING_EFFORTS.find((e) => e.id === reasoningEffort) ?? REASONING_EFFORTS[1] // default low

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    if (disabled) return
    setStep('model')
    setPendingModel(null)
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
    setStep('model')
    setPendingModel(null)
  }

  const handleModelClick = (model: GeminiModelOption) => {
    onSelectModel(model.id)
    setPendingModel(model)
    // 進入第二層：選擇思考強度
    setStep('effort')
  }

  const handleEffortClick = (effort: ReasoningEffortOption) => {
    onSelectReasoningEffort(effort.id)
    handleClose()
  }

  const handleBackToModels = () => {
    setStep('model')
  }

  const activeModelForEffort = pendingModel ?? currentModel

  return (
    <>
      <ButtonBase
        onClick={handleOpen}
        disabled={disabled}
        aria-label="選擇 Gemini 模型與思考強度"
        aria-haspopup="true"
        aria-expanded={open}
        sx={
          variant === 'minimal'
            ? {
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                px: 0.9,
                py: 0.35,
                borderRadius: 2,
                color: 'text.secondary',
                fontSize: '0.82rem',
                fontWeight: 600,
                transition: 'all 160ms ease',
                opacity: disabled ? 0.6 : 1,
                '&:hover': {
                  bgcolor: 'rgba(0, 0, 0, 0.05)',
                  color: 'text.primary',
                },
              }
            : {
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                px: size === 'small' ? 1.25 : 1.6,
                py: size === 'small' ? 0.45 : 0.65,
                borderRadius: 3,
                bgcolor: 'rgba(13, 118, 110, 0.08)',
                border: '1px solid rgba(13, 118, 110, 0.2)',
                color: '#0d766e',
                fontSize: size === 'small' ? '0.78rem' : '0.86rem',
                fontWeight: 700,
                transition: 'all 160ms ease',
                opacity: disabled ? 0.6 : 1,
                '&:hover': {
                  bgcolor: 'rgba(13, 118, 110, 0.14)',
                  borderColor: '#0d766e',
                },
              }
        }
      >
        {variant === 'minimal' ? (
          <>
            <span>{currentModel.label}</span>
            <Typography
              component="span"
              sx={{
                color: currentEffort.id === 'off' ? 'text.disabled' : '#0d766e',
                fontSize: '0.76rem',
                fontWeight: 700,
                ml: 0.25,
              }}
            >
              {currentEffort.shortLabel}
            </Typography>
          </>
        ) : (
          <>
            <AutoAwesomeRoundedIcon sx={{ fontSize: size === 'small' ? 15 : 17 }} />
            <span>{currentModel.shortLabel}</span>
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.3,
                px: 0.7,
                py: 0.1,
                borderRadius: 1.5,
                bgcolor:
                  currentEffort.id === 'off'
                    ? 'rgba(0, 0, 0, 0.06)'
                    : 'rgba(99, 102, 241, 0.12)',
                color: currentEffort.id === 'off' ? 'text.secondary' : '#4338ca',
                fontSize: '0.72rem',
                fontWeight: 800,
              }}
            >
              <PsychologyRoundedIcon sx={{ fontSize: 13 }} />
              {currentEffort.shortLabel}
            </Box>
          </>
        )}
        <ExpandMoreRoundedIcon
          sx={{
            fontSize: size === 'small' ? 15 : 18,
            transition: 'transform 180ms ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </ButtonBase>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{
          paper: {
            sx: {
              borderRadius: 3,
              minWidth: 290,
              maxWidth: 360,
              boxShadow: '0 12px 36px rgba(0,0,0,0.14)',
              p: 0.5,
            },
          },
        }}
      >
        {step === 'model' ? (
          <>
            <Box sx={{ px: 2, pt: 1, pb: 0.5 }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: '0.04em' }}
              >
                1. 選擇 GEMINI 模型
              </Typography>
            </Box>
            {GEMINI_MODELS.map((model) => {
              const isSelected = model.id === currentModel.id
              return (
                <MenuItem
                  key={model.id}
                  onClick={() => handleModelClick(model)}
                  selected={isSelected}
                  sx={{
                    py: 1.1,
                    px: 1.5,
                    borderRadius: 2,
                    mb: 0.5,
                    alignItems: 'flex-start',
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 28,
                      mt: 0.3,
                      color: isSelected ? 'primary.main' : 'text.disabled',
                    }}
                  >
                    {isSelected ? <CheckRoundedIcon fontSize="small" /> : <Box sx={{ width: 20 }} />}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography
                          sx={{
                            fontWeight: isSelected ? 800 : 600,
                            fontSize: '0.88rem',
                          }}
                        >
                          {model.name}
                        </Typography>
                        {model.badge ? (
                          <Chip
                            size="small"
                            label={model.badge}
                            color={model.badge === '永遠最新' ? 'secondary' : 'primary'}
                            sx={{ height: 20, fontSize: '0.68rem', fontWeight: 800 }}
                          />
                        ) : null}
                      </Stack>
                    }
                    secondary={
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', mt: 0.3 }}
                      >
                        {model.description}
                      </Typography>
                    }
                  />
                  <ChevronRightRoundedIcon
                    sx={{ mt: 0.6, fontSize: 18, color: 'text.secondary', opacity: 0.7 }}
                  />
                </MenuItem>
              )
            })}
          </>
        ) : (
          <>
            <Stack
              direction="row"
              spacing={1}
              sx={{ px: 1, py: 0.75, alignItems: 'center' }}
            >
              <IconButton
                size="small"
                onClick={handleBackToModels}
                aria-label="返回模型清單"
                sx={{ width: 28, height: 28 }}
              >
                <ArrowBackRoundedIcon fontSize="small" />
              </IconButton>
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: '0.04em' }}
                >
                  2. 選擇思考強度 ({activeModelForEffort.shortLabel})
                </Typography>
              </Box>
            </Stack>
            <Divider sx={{ mb: 0.75 }} />
            {REASONING_EFFORTS.map((effort) => {
              const isSelected = effort.id === currentEffort.id
              return (
                <MenuItem
                  key={effort.id}
                  onClick={() => handleEffortClick(effort)}
                  selected={isSelected}
                  sx={{
                    py: 1.1,
                    px: 1.5,
                    borderRadius: 2,
                    mb: 0.5,
                    alignItems: 'flex-start',
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 28,
                      mt: 0.3,
                      color: isSelected ? 'primary.main' : 'text.disabled',
                    }}
                  >
                    {isSelected ? <CheckRoundedIcon fontSize="small" /> : <Box sx={{ width: 20 }} />}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography
                          sx={{
                            fontWeight: isSelected ? 800 : 600,
                            fontSize: '0.88rem',
                          }}
                        >
                          {effort.label}
                        </Typography>
                        {effort.id === 'low' ? (
                          <Chip
                            size="small"
                            label="預設"
                            color="info"
                            sx={{ height: 18, fontSize: '0.66rem', fontWeight: 800 }}
                          />
                        ) : null}
                      </Stack>
                    }
                    secondary={
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', mt: 0.3 }}
                      >
                        {effort.description}
                      </Typography>
                    }
                  />
                </MenuItem>
              )
            })}
          </>
        )}
      </Menu>
    </>
  )
}
