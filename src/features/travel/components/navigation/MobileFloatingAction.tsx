import AddRoundedIcon from '@mui/icons-material/AddRounded'
import { Fab, Zoom } from '@mui/material'
import type { WorkspaceSection } from '../../travelWorkspaceUtils'
import { triggerHaptic } from '../../../../lib/haptics'

interface MobileFloatingActionProps {
  section: WorkspaceSection
  visible: boolean
  onAddAttraction?: () => void
  onFocusTodoInput?: () => void
  onAddExpense?: () => void
}

export function MobileFloatingAction({
  section,
  visible,
  onAddAttraction,
  onFocusTodoInput,
  onAddExpense,
}: MobileFloatingActionProps) {
  if (!visible || section === 'overview' || section === 'assistant') {
    return null
  }

  let label = ''
  let onClick: (() => void) | undefined

  if (section === 'schedule') {
    label = '新增景點'
    onClick = onAddAttraction
  } else if (section === 'todos') {
    label = '新增待辦'
    onClick = onFocusTodoInput
  } else if (section === 'expenses') {
    label = '新增費用'
    onClick = onAddExpense
  }

  if (!onClick) return null

  const handleClick = () => {
    triggerHaptic('medium')
    onClick?.()
  }

  return (
    <Zoom in={visible} unmountOnExit>
      <Fab
        variant="extended"
        color="primary"
        size="medium"
        onClick={handleClick}
        aria-label={label}
        sx={{
          display: { xs: 'flex', md: 'none' },
          position: 'fixed',
          right: 18,
          bottom: 'calc(70px + env(safe-area-inset-bottom, 0px))',
          zIndex: 25,
          fontWeight: 850,
          fontSize: '0.88rem',
          boxShadow: '0 6px 20px rgba(13, 118, 110, 0.35)',
          px: 2,
          gap: 0.75,
          backdropFilter: 'blur(10px)',
          transition: 'all 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          '&:active': {
            transform: 'scale(0.94)',
          },
        }}
      >
        <AddRoundedIcon sx={{ fontSize: 20 }} />
        {label}
      </Fab>
    </Zoom>
  )
}
