import { useState } from 'react'
import type { ReactNode } from 'react'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import MapRoundedIcon from '@mui/icons-material/MapRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../../components/PageHeader'

interface TravelWorkspaceHeaderProps {
  title: string
  subtitle: string
  loading: boolean
  showBack: boolean
  canEdit: boolean
  canOpenAssistant: boolean
  assistantMode: boolean
  assistantActions?: ReactNode
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
  assistantMode,
  assistantActions,
  onBack,
  onEdit,
  onOpenAssistant,
  onOpenGoogleMapsTest,
  onRefresh,
  onSignOut,
}: TravelWorkspaceHeaderProps) {
  const { t } = useTranslation()
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

  return (
    <PageHeader
      title={title}
      subtitle={subtitle}
      onBack={showBack ? onBack : undefined}
      backLabel="返回我的行程"
      actions={(
        assistantMode ? (
          assistantActions
        ) : showBack ? (
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
                  onOpenGoogleMapsTest()
                }}
              >
                <ListItemIcon>
                  <MapRoundedIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Google Maps API 測試</ListItemText>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null)
                  void onSignOut()
                }}
              >
                <ListItemIcon>
                  <LogoutRoundedIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{t('list.signOut')}</ListItemText>
              </MenuItem>
            </Menu>
          </>
        )
      )}
    />
  )
}
