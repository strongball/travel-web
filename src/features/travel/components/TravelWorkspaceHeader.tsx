import { useState } from 'react'
import type { ReactNode } from 'react'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import MapRoundedIcon from '@mui/icons-material/MapRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip, useMediaQuery } from '@mui/material'
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
  const isCompact = useMediaQuery('(max-width: 600px)')

  return (
    <PageHeader
      title={title}
      subtitle={subtitle}
      onBack={showBack ? onBack : undefined}
      backLabel="返回我的行程"
      actions={(
        assistantMode ? assistantActions : <>
          {canOpenAssistant ? (
            <Tooltip title="開啟旅程助理">
              <IconButton onClick={onOpenAssistant} aria-label="開啟旅程助理" color="primary">
                <AutoAwesomeRoundedIcon />
              </IconButton>
            </Tooltip>
          ) : null}
          {canEdit ? (
            <Tooltip title="編輯行程">
              <IconButton onClick={onEdit} aria-label="編輯行程">
                <EditRoundedIcon />
              </IconButton>
            </Tooltip>
          ) : null}
          {isCompact ? (
            <>
              <Tooltip title="更多操作">
                <IconButton
                  aria-label="更多操作"
                  aria-controls={menuAnchor ? 'travel-appbar-menu' : undefined}
                  aria-haspopup="true"
                  onClick={(event) => setMenuAnchor(event.currentTarget)}
                >
                  <MoreVertRoundedIcon />
                </IconButton>
              </Tooltip>
              <Menu
                id="travel-appbar-menu"
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
                  <ListItemIcon><MapRoundedIcon fontSize="small" /></ListItemIcon>
                  <ListItemText>Google Maps API 測試</ListItemText>
                </MenuItem>
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
                <MenuItem
                  onClick={() => {
                    setMenuAnchor(null)
                    void onSignOut()
                  }}
                >
                  <ListItemIcon><LogoutRoundedIcon fontSize="small" /></ListItemIcon>
                  <ListItemText>{t('list.signOut')}</ListItemText>
                </MenuItem>
              </Menu>
            </>
          ) : (
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
              <Tooltip title={t('list.signOut')}>
                <IconButton onClick={() => void onSignOut()} aria-label={t('list.signOut')}>
                  <LogoutRoundedIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="更多工具">
                <IconButton
                  aria-label="更多工具"
                  aria-controls={menuAnchor ? 'travel-tools-menu' : undefined}
                  aria-haspopup="true"
                  onClick={(event) => setMenuAnchor(event.currentTarget)}
                >
                  <MoreVertRoundedIcon />
                </IconButton>
              </Tooltip>
              <Menu
                id="travel-tools-menu"
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
                  <ListItemIcon><MapRoundedIcon fontSize="small" /></ListItemIcon>
                  <ListItemText>Google Maps API 測試</ListItemText>
                </MenuItem>
              </Menu>
            </>
          )}
        </>
      )}
    />
  )
}
