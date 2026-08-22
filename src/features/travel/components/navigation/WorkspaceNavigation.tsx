import EventNoteRoundedIcon from '@mui/icons-material/EventNoteRounded'
import PaidRoundedIcon from '@mui/icons-material/PaidRounded'
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded'
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded'
import {
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Tab,
  Tabs,
} from '@mui/material'
import type { WorkspaceSection } from '../../travelWorkspaceUtils'

interface WorkspaceDesktopTabsProps {
  section: WorkspaceSection
  todoCount: number
  completedTodoCount: number
  onSectionChange: (section: WorkspaceSection) => void
}

export function WorkspaceDesktopTabs({
  section,
  todoCount,
  completedTodoCount,
  onSectionChange,
}: WorkspaceDesktopTabsProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        display: { xs: 'none', md: 'block' },
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <Tabs
        value={section}
        onChange={(_, value: WorkspaceSection) => onSectionChange(value)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ px: 1 }}
      >
        <Tab value="schedule" label="日程" icon={<EventNoteRoundedIcon />} iconPosition="start" />
        <Tab
          value="todos"
          label={`待辦 ${todoCount ? `(${completedTodoCount}/${todoCount})` : ''}`}
          icon={<TaskAltRoundedIcon />}
          iconPosition="start"
        />
        <Tab value="expenses" label="費用" icon={<PaidRoundedIcon />} iconPosition="start" />
        <Tab value="overview" label="總覽" icon={<PlaceRoundedIcon />} iconPosition="start" />
      </Tabs>
    </Paper>
  )
}

interface WorkspaceBottomNavProps {
  section: WorkspaceSection
  visible: boolean
  onSectionChange: (section: WorkspaceSection) => void
}

export function WorkspaceBottomNav({
  section,
  visible,
  onSectionChange,
}: WorkspaceBottomNavProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        display: { xs: visible ? 'block' : 'none', md: 'none' },
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        borderRadius: 0,
        bgcolor: 'rgba(255, 255, 255, 0.88)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(13, 118, 110, 0.1)',
        boxShadow: '0 -4px 20px rgba(15, 23, 42, 0.06)',
        pb: 'max(8px, env(safe-area-inset-bottom))',
        pt: 0.5,
      }}
    >
      <BottomNavigation
        value={section}
        onChange={(_, value: WorkspaceSection) => onSectionChange(value)}
        showLabels
        sx={{
          bgcolor: 'transparent',
          height: 58,
          '& .MuiBottomNavigationAction-root': {
            minWidth: 0,
            py: 0.5,
            color: '#64748b',
            transition: 'all 180ms ease',
            '&.Mui-selected': {
              color: '#0d766e',
              fontWeight: 800,
              '& .MuiSvgIcon-root': {
                transform: 'translateY(-2px) scale(1.12)',
                transition: 'transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              },
            },
          },
        }}
      >
        <BottomNavigationAction value="schedule" label="行程" icon={<EventNoteRoundedIcon />} />
        <BottomNavigationAction value="todos" label="待辦" icon={<TaskAltRoundedIcon />} />
        <BottomNavigationAction value="expenses" label="費用" icon={<PaidRoundedIcon />} />
        <BottomNavigationAction value="overview" label="總覽" icon={<PlaceRoundedIcon />} />
      </BottomNavigation>
    </Paper>
  )
}
