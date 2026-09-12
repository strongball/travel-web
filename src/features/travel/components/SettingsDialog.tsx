import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded'
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import MapRoundedIcon from '@mui/icons-material/MapRounded'
import SettingsBrightnessRoundedIcon from '@mui/icons-material/SettingsBrightnessRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import {
  Button,
  Card,
  CardActionArea,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from '@mui/material'
import { useRiverRef, useRiverWatch } from '@stball/react-river'
import {
  setStoredThemePreference,
  themePreferenceProvider,
  type ThemePreference,
} from '../../../providers'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  onOpenGoogleMapsTest: () => void
  onSignOut: () => void | Promise<void>
}

const THEME_OPTIONS: {
  value: ThemePreference
  title: string
  subtitle: string
  icon: typeof SettingsBrightnessRoundedIcon
}[] = [
  {
    value: 'system',
    title: '跟隨系統',
    subtitle: '根據裝置系統設定自動切換',
    icon: SettingsBrightnessRoundedIcon,
  },
  {
    value: 'light',
    title: '淺色模式',
    subtitle: '清新明亮的翠綠風格',
    icon: LightModeRoundedIcon,
  },
  {
    value: 'dark',
    title: '深色模式',
    subtitle: '沉穩舒適的夜間護眼風格',
    icon: DarkModeRoundedIcon,
  },
]

export function SettingsDialog({
  open,
  onClose,
  onOpenGoogleMapsTest,
  onSignOut,
}: SettingsDialogProps) {
  const ref = useRiverRef()
  const themePref = useRiverWatch(themePreferenceProvider)

  const handleSelectTheme = (val: ThemePreference) => {
    ref.set(themePreferenceProvider, val)
    setStoredThemePreference(val)
  }

  const handleSignOutClick = async () => {
    if (window.confirm('確定要登出帳號嗎？')) {
      onClose()
      await onSignOut()
    }
  }

  const handleMapsTestClick = () => {
    onClose()
    onOpenGoogleMapsTest()
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <SettingsRoundedIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 900 }}>
            系統設定
          </Typography>
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5}>
          {/* Theme Section */}
          <Stack spacing={1}>
            <Typography variant="subtitle2" sx={{ fontWeight: 900, color: 'text.secondary' }}>
              外觀色彩模式
            </Typography>
            <Stack spacing={1}>
              {THEME_OPTIONS.map((opt) => {
                const isSelected = themePref === opt.value
                const IconComponent = opt.icon
                return (
                  <Card
                    key={opt.value}
                    variant="outlined"
                    sx={{
                      borderRadius: 2,
                      borderColor: isSelected ? 'primary.main' : 'divider',
                      borderWidth: isSelected ? '1.5px' : '1px',
                      bgcolor: isSelected ? 'action.hover' : 'background.paper',
                      transition: 'border-color 150ms ease, background-color 150ms ease',
                    }}
                  >
                    <CardActionArea
                      onClick={() => handleSelectTheme(opt.value)}
                      sx={{ p: 1.5 }}
                    >
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                        <IconComponent
                          color={isSelected ? 'primary' : 'action'}
                          sx={{ fontSize: 24 }}
                        />
                        <Stack spacing={0.25} sx={{ flex: 1 }}>
                          <Typography
                            sx={{
                              fontWeight: 800,
                              fontSize: '0.92rem',
                              color: isSelected ? 'primary.main' : 'text.primary',
                            }}
                          >
                            {opt.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {opt.subtitle}
                          </Typography>
                        </Stack>
                      </Stack>
                    </CardActionArea>
                  </Card>
                )
              })}
            </Stack>
          </Stack>

          <Divider />

          {/* Tools & Dev Section */}
          <Stack spacing={1}>
            <Typography variant="subtitle2" sx={{ fontWeight: 900, color: 'text.secondary' }}>
              工具與測試
            </Typography>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<MapRoundedIcon />}
              onClick={handleMapsTestClick}
              sx={{ justifyContent: 'flex-start', py: 1 }}
            >
              Google Maps API 測試
            </Button>
          </Stack>

          <Divider />

          {/* Account Section */}
          <Stack spacing={1}>
            <Typography variant="subtitle2" sx={{ fontWeight: 900, color: 'text.secondary' }}>
              帳號管理
            </Typography>
            <Button
              fullWidth
              variant="outlined"
              color="error"
              startIcon={<LogoutRoundedIcon />}
              onClick={handleSignOutClick}
              sx={{ justifyContent: 'flex-start', py: 1 }}
            >
              登出帳號
            </Button>
          </Stack>

          <Divider />

          {/* About Section */}
          <Stack spacing={0.5} sx={{ pt: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Travel Web 行程規劃助理 · v1.0.0
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              支援 PWA 離線檢視與即時同步
            </Typography>
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Button variant="contained" onClick={onClose} fullWidth>
          完成
        </Button>
      </DialogActions>
    </Dialog>
  )
}
