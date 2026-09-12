import { useState } from 'react'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import { Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material'
import { PageHeader } from '../../../components/PageHeader'
import { SettingsDialog } from './SettingsDialog'

interface TravelWorkspaceHeaderProps {
  title: string
  subtitle: string
  loading: boolean
  showBack: boolean
  canEdit: boolean
  canOpenAssistant: boolean
  onBack: () => void
  onEdit: () => void
  onOpenAssistant: () => void
  onOpenGoogleMapsTest: () => void
  onRefresh: () => void | Promise<void>
  onSignOut: () => void | Promise<void>
}

export function TravelWorkspaceHeader({
  title,
  subtitle,
  loading,
  showBack,
  canEdit,
  canOpenAssistant,
  onBack,
  onEdit,
  onOpenAssistant,
  onOpenGoogleMapsTest,
  onRefresh,
  onSignOut,
}: TravelWorkspaceHeaderProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        onBack={showBack ? onBack : undefined}
        backLabel="返回我的行程"
        actions={
          showBack ? (
            /* Detail / In-Trip View */
            <>
              {canOpenAssistant ? (
                <Tooltip title="開啟旅程助理">
                  <IconButton onClick={onOpenAssistant} aria-label="開啟旅程助理" color="primary">
                    <AutoAwesomeRoundedIcon />
                  </IconButton>
                </Tooltip>
              ) : null}
              <Tooltip title="更多操作">
                <IconButton
                  aria-label="更多操作"
                  aria-controls={menuAnchor ? 'travel-detail-menu' : undefined}
                  aria-haspopup="true"
                  onClick={(event) => setMenuAnchor(event.currentTarget)}
                >
                  <MoreVertRoundedIcon />
                </IconButton>
              </Tooltip>
              <Menu
                id="travel-detail-menu"
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              >
                {canEdit ? (
                  <MenuItem
                    onClick={() => {
                      setMenuAnchor(null)
                      onEdit()
                    }}
                  >
                    <ListItemIcon>
                      <EditRoundedIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>編輯行程</ListItemText>
                  </MenuItem>
                ) : null}
                <MenuItem
                  disabled={loading}
                  onClick={() => {
                    setMenuAnchor(null)
                    void onRefresh()
                  }}
                >
                  <ListItemIcon>
                    <RefreshRoundedIcon
                      fontSize="small"
                      sx={{
                        animation: loading ? 'spin 1s linear infinite' : 'none',
                        '@keyframes spin': {
                          '0%': { transform: 'rotate(0deg)' },
                          '100%': { transform: 'rotate(360deg)' },
                        },
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText>重新整理</ListItemText>
                </MenuItem>
                <Divider />
                <MenuItem
                  onClick={() => {
                    setMenuAnchor(null)
                    setSettingsOpen(true)
                  }}
                >
                  <ListItemIcon>
                    <SettingsRoundedIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>系統設定</ListItemText>
                </MenuItem>
              </Menu>
            </>
          ) : (
            /* Home / Trips List View */
            <>
              <Tooltip title="重新整理">
                <span>
                  <IconButton disabled={loading} onClick={() => void onRefresh()} aria-label="重新整理">
                    <RefreshRoundedIcon
                      sx={{
                        animation: loading ? 'spin 1s linear infinite' : 'none',
                        '@keyframes spin': {
                          '0%': { transform: 'rotate(0deg)' },
                          '100%': { transform: 'rotate(360deg)' },
                        },
                      }}
                    />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="更多選項">
                <IconButton
                  aria-label="更多選項"
                  aria-controls={menuAnchor ? 'travel-list-menu' : undefined}
                  aria-haspopup="true"
                  onClick={(event) => setMenuAnchor(event.currentTarget)}
                >
                  <MoreVertRoundedIcon />
                </IconButton>
              </Tooltip>
              <Menu
                id="travel-list-menu"
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              >
                <MenuItem
                  onClick={() => {
                    setMenuAnchor(null)
                    setSettingsOpen(true)
                  }}
                >
                  <ListItemIcon>
                    <SettingsRoundedIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>系統設定</ListItemText>
                </MenuItem>
              </Menu>
            </>
          )
        }
      />

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenGoogleMapsTest={onOpenGoogleMapsTest}
        onSignOut={onSignOut}
      />
    </>
  )
}
