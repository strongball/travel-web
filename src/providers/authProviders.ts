import type { Session } from '@supabase/supabase-js'
import { provider, stateProvider } from '@stball/react-river'

export const sessionProvider = stateProvider<Session | null>(() => null, {
  name: 'session',
})

export const authReadyProvider = stateProvider<boolean>(() => false, {
  name: 'authReady',
})

export const userIdProvider = provider<string | null>(
  (ref) => ref.watch(sessionProvider)?.user.id ?? null,
  { name: 'userId' },
)
