import { useState, type FormEvent } from 'react'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Container,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'

export type AuthMode = 'signIn' | 'signUp'

export interface LoginPageProps {
  onSubmit: (email: string, password: string, mode: AuthMode) => void | Promise<void>
  onGoogleSignIn: () => void | Promise<void>
  loading?: boolean
  error?: string | null
}

export function LoginPage({
  onSubmit,
  onGoogleSignIn,
  loading = false,
  error = null,
}: LoginPageProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<AuthMode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const isSignIn = mode === 'signIn'

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void onSubmit(email.trim(), password, mode)
  }

  const switchMode = () => {
    setMode(isSignIn ? 'signUp' : 'signIn')
  }

  return (
    <Box
      component="main"
      sx={{
        alignItems: 'center',
        bgcolor: 'background.default',
        display: 'flex',
        minHeight: '100dvh',
        py: { xs: 3, sm: 6 },
      }}
    >
      <Container maxWidth="xs" sx={{ px: { xs: 2, sm: 3 } }}>
        <Paper
          elevation={0}
          sx={{
            border: 1,
            borderColor: 'divider',
            borderRadius: 4,
            p: { xs: 3, sm: 4 },
          }}
        >
          <Stack spacing={3}>
            <Stack spacing={1.5} sx={{ alignItems: 'center', textAlign: 'center' }}>
              <Avatar sx={{ bgcolor: 'primary.main', height: 48, width: 48 }}>
                <LockOutlinedIcon aria-hidden="true" />
              </Avatar>
              <Box>
                <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
                  {t(isSignIn ? 'auth.signInTitle' : 'auth.signUpTitle')}
                </Typography>
                <Typography color="text.secondary" variant="body2" sx={{ mt: 0.75 }}>
                  {t(isSignIn ? 'auth.signInSubtitle' : 'auth.signUpSubtitle')}
                </Typography>
              </Box>
            </Stack>

            {error ? (
              <Alert severity="error" role="alert">
                {error}
              </Alert>
            ) : null}

            <Button
              disabled={loading}
              fullWidth
              onClick={() => void onGoogleSignIn()}
              size="large"
              variant="outlined"
              sx={{ minHeight: 48 }}
            >
              {t('auth.continueWithGoogle')}
            </Button>

            <Divider>{t('auth.orEmail')}</Divider>

            <Box component="form" onSubmit={handleSubmit} noValidate>
              <Stack spacing={2.25}>
                <TextField
                  autoComplete="email"
                  autoFocus
                  disabled={loading}
                  fullWidth
                  id="email"
                  label={t('auth.email')}
                  name="email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
                <TextField
                  autoComplete={isSignIn ? 'current-password' : 'new-password'}
                  disabled={loading}
                  fullWidth
                  id="password"
                  label={t('auth.password')}
                  name="password"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  slotProps={{ htmlInput: { minLength: 6 } }}
                  type="password"
                  value={password}
                />
                <Button
                  disabled={loading}
                  fullWidth
                  size="large"
                  type="submit"
                  variant="contained"
                  sx={{ minHeight: 48 }}
                >
                  {loading ? (
                    <CircularProgress
                      aria-label={t(isSignIn ? 'auth.signIn' : 'auth.signUp')}
                      color="inherit"
                      size={22}
                    />
                  ) : (
                    t(isSignIn ? 'auth.signIn' : 'auth.signUp')
                  )}
                </Button>
              </Stack>
            </Box>

            <Button
              disabled={loading}
              onClick={switchMode}
              size="large"
              sx={{ alignSelf: 'center' }}
            >
              {t(isSignIn ? 'auth.toSignUp' : 'auth.toSignIn')}
            </Button>
          </Stack>
        </Paper>
      </Container>
    </Box>
  )
}

export default LoginPage
