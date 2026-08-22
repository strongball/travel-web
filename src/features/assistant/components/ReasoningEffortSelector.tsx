import { useState } from 'react'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded'
import {
  Box,
  ButtonBase,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material'
import {
  REASONING_EFFORTS,
  type ReasoningEffort,
  type ReasoningEffortOption,
} from '../models'

interface ReasoningEffortSelectorProps {
  reasoningEffort: ReasoningEffort
  onSelectReasoningEffort: (effort: ReasoningEffort) => void
  disabled?: boolean
  size?: 'small' | 'medium'
}

export function ReasoningEffortSelector({
  reasoningEffort,
  onSelectReasoningEffort,
  disabled = false,
  size = 'small',
}: ReasoningEffortSelectorProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  const currentOption =
    REASONING_EFFORTS.find((e) => e.id === reasoningEffort) ?? REASONING_EFFORTS[0]

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    if (disabled) return
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleSelect = (option: ReasoningEffortOption) => {
    onSelectReasoningEffort(option.id)
    handleClose()
  }

  return (
    <>
      <ButtonBase
        onClick={handleOpen}
        disabled={disabled}
        aria-label="選擇 AI 思考推理強度"
        aria-haspopup="true"
        aria-expanded={open}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          px: size === 'small' ? 1.1 : 1.5,
          py: size === 'small' ? 0.4 : 0.6,
          borderRadius: 3,
          bgcolor:
            currentOption.id === 'off'
              ? 'rgba(0, 0, 0, 0.04)'
              : 'rgba(99, 102, 241, 0.08)',
          border:
            currentOption.id === 'off'
              ? '1px solid rgba(0, 0, 0, 0.12)'
              : '1px solid rgba(99, 102, 241, 0.25)',
          color: currentOption.id === 'off' ? 'text.secondary' : '#4f46e5',
          fontSize: size === 'small' ? '0.78rem' : '0.86rem',
          fontWeight: 700,
          transition: 'all 160ms ease',
          opacity: disabled ? 0.6 : 1,
          '&:hover': {
            bgcolor:
              currentOption.id === 'off'
                ? 'rgba(0, 0, 0, 0.08)'
                : 'rgba(99, 102, 241, 0.15)',
          },
        }}
      >
        <PsychologyRoundedIcon sx={{ fontSize: size === 'small' ? 15 : 17 }} />
        <span>思考: {currentOption.shortLabel}</span>
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
              minWidth: 260,
              maxWidth: 320,
              boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
              p: 0.5,
            },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: '0.04em' }}
          >
            思考推理預算 (REASONING EFFORT)
          </Typography>
        </Box>
        {REASONING_EFFORTS.map((option) => {
          const isSelected = option.id === currentOption.id
          return (
            <MenuItem
              key={option.id}
              onClick={() => handleSelect(option)}
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
                      {option.label}
                    </Typography>
                  </Stack>
                }
                secondary={
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 0.3 }}
                  >
                    {option.description}
                  </Typography>
                }
              />
            </MenuItem>
          )
        })}
      </Menu>
    </>
  )
}
