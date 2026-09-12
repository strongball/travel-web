import { Component, type ErrorInfo, type ReactNode } from 'react'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import {
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Typography,
} from '@mui/material'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onReset?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Unhandled application error in ErrorBoundary:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      const errorMessage = this.state.error?.message || '發生未預期的錯誤'

      return (
        <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 3, sm: 4 },
              borderRadius: 3,
              borderColor: 'error.light',
              bgcolor: 'background.paper',
              textAlign: 'center',
            }}
          >
            <Stack spacing={2.5} sx={{ alignItems: 'center' }}>
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  bgcolor: 'error.lighter',
                  color: 'error.main',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <WarningAmberRoundedIcon sx={{ fontSize: 32 }} />
              </Box>

              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  應用程式發生錯誤
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                  系統已阻斷錯誤擴散，您可以嘗試重新載入元件或重新整理頁面。
                </Typography>
              </Box>

              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  width: '100%',
                  bgcolor: 'action.hover',
                  borderRadius: 2,
                  textAlign: 'left',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: 'ui-monospace, monospace',
                    wordBreak: 'break-word',
                    color: 'text.secondary',
                  }}
                >
                  {errorMessage}
                </Typography>
              </Paper>

              <Stack direction="row" spacing={1.5} sx={{ pt: 1 }}>
                <Button
                  variant="outlined"
                  startIcon={<RestartAltRoundedIcon />}
                  onClick={this.handleReset}
                >
                  重試元件
                </Button>
                <Button
                  variant="contained"
                  startIcon={<RefreshRoundedIcon />}
                  onClick={this.handleReload}
                >
                  重新整理頁面
                </Button>
              </Stack>
            </Stack>
          </Paper>
        </Container>
      )
    }

    return this.props.children
  }
}
