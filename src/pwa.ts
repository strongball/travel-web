import { config } from './config'

export function registerPwa() {
  if (!config.app.isProd || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${config.app.baseUrl}sw.js`, {
      scope: config.app.baseUrl,
    })
  }, { once: true })
}
