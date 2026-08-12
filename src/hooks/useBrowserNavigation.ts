import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  WorkspaceRoute,
  WorkspaceSection,
  WorkspaceView,
} from '../features/travel/TravelWorkspacePage'

export type AppView = 'workspace' | 'editor' | 'review' | 'google-maps-test'
type BrowserBackHandler = () => boolean
type TravelHistoryState = {
  travelApp?: boolean
  travelView?: AppView
  travelGuard?: boolean
  travelSection?: WorkspaceSection
  travelWorkspaceView?: WorkspaceView
  travelItineraryId?: string | null
}

const defaultWorkspaceRoute: WorkspaceRoute = {
  section: 'schedule',
  workspaceView: 'trips',
  itineraryId: null,
}

const readWorkspaceRoute = (state: unknown): WorkspaceRoute => {
  const value = state && typeof state === 'object' ? state as TravelHistoryState : {}
  return {
    section: value.travelSection ?? defaultWorkspaceRoute.section,
    workspaceView: value.travelWorkspaceView ?? defaultWorkspaceRoute.workspaceView,
    itineraryId: value.travelItineraryId ?? defaultWorkspaceRoute.itineraryId,
  }
}

export function useBrowserNavigation(sessionActive: boolean) {
  const [view, setView] = useState<AppView>('workspace')
  const [workspaceRoute, setWorkspaceRoute] = useState<WorkspaceRoute>(() =>
    readWorkspaceRoute(window.history.state),
  )
  const browserHistoryInitialized = useRef(false)
  const browserBackHandler = useRef<BrowserBackHandler | null>(null)
  const workspaceRouteRef = useRef(workspaceRoute)

  const navigateView = useCallback((nextView: AppView, mode: 'push' | 'replace' = 'push') => {
    const route = workspaceRouteRef.current
    const nextState = {
      ...(window.history.state && typeof window.history.state === 'object'
        ? window.history.state
        : {}),
      travelApp: true,
      travelView: nextView,
      travelGuard: false,
      travelSection: route.section,
      travelWorkspaceView: route.workspaceView,
      travelItineraryId: route.itineraryId,
    }
    if (mode === 'replace') {
      window.history.replaceState(nextState, '')
    } else {
      window.history.pushState(nextState, '')
    }
    setView(nextView)
  }, [])

  const rememberWorkspaceRoute = useCallback((route: WorkspaceRoute) => {
    workspaceRouteRef.current = route
    setWorkspaceRoute(route)
    const currentState = window.history.state && typeof window.history.state === 'object'
      ? window.history.state
      : {}
    window.history.replaceState(
      {
        ...currentState,
        travelApp: true,
        travelSection: route.section,
        travelWorkspaceView: route.workspaceView,
        travelItineraryId: route.itineraryId,
      },
      '',
    )
  }, [])

  const registerBrowserBackHandler = useCallback((handler: BrowserBackHandler | null) => {
    browserBackHandler.current = handler
  }, [])

  const getWorkspaceRoute = useCallback(() => workspaceRouteRef.current, [])

  useEffect(() => {
    if (!sessionActive) {
      browserHistoryInitialized.current = false
      browserBackHandler.current = null
      return
    }
    if (browserHistoryInitialized.current) return

    const initialRoute = readWorkspaceRoute(window.history.state)
    workspaceRouteRef.current = initialRoute
    setWorkspaceRoute(initialRoute)
    const baseState = {
      ...(window.history.state && typeof window.history.state === 'object'
        ? window.history.state
        : {}),
      travelApp: true,
      travelView: 'workspace' as const,
      travelGuard: false,
      travelSection: initialRoute.section,
      travelWorkspaceView: initialRoute.workspaceView,
      travelItineraryId: initialRoute.itineraryId,
    }
    window.history.replaceState(baseState, '')
    window.history.pushState({ ...baseState, travelGuard: true }, '')
    browserHistoryInitialized.current = true

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as TravelHistoryState | null
      const nextView = state?.travelView
      const isKnownView = nextView === 'workspace' || nextView === 'editor' || nextView === 'review' || nextView === 'google-maps-test'

      if (browserBackHandler.current?.()) {
        const route = workspaceRouteRef.current
        window.history.pushState(
          state?.travelApp
            ? {
                ...state,
                travelGuard: true,
                travelSection: route.section,
                travelWorkspaceView: route.workspaceView,
                travelItineraryId: route.itineraryId,
              }
            : {
                travelApp: true,
                travelView: 'workspace',
                travelGuard: true,
                travelSection: route.section,
                travelWorkspaceView: route.workspaceView,
                travelItineraryId: route.itineraryId,
              },
          '',
        )
        return
      }

      if (state?.travelApp && isKnownView) {
        const nextRoute = readWorkspaceRoute(state)
        workspaceRouteRef.current = nextRoute
        setWorkspaceRoute(nextRoute)
        setView(nextView)
        if (!state.travelGuard && nextView === 'workspace') {
          window.history.pushState(
            { ...state, travelView: 'workspace', travelGuard: true },
            '',
          )
        }
        return
      }

      window.history.pushState(
        {
          travelApp: true,
          travelView: 'workspace',
          travelGuard: true,
          travelSection: workspaceRouteRef.current.section,
          travelWorkspaceView: workspaceRouteRef.current.workspaceView,
          travelItineraryId: workspaceRouteRef.current.itineraryId,
        },
        '',
      )
      setView('workspace')
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [sessionActive])

  return {
    getWorkspaceRoute,
    navigateView,
    registerBrowserBackHandler,
    rememberWorkspaceRoute,
    view,
    workspaceRoute,
  }
}
