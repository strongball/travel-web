import {
  AsyncLocalStorageProviderSingleton,
  type AsyncLocalStorageInterface,
} from '@langchain/core/singletons'

/**
 * The web build of LangGraph deliberately does not import node:async_hooks.
 * Dynamic interrupts still need the current runnable config, so provide the
 * smallest browser-compatible async context implementation when the host does
 * not already provide one. The graph runner serializes turns per thread, and
 * LangChain replaces this value as nested runnable callbacks execute.
 */
class BrowserAsyncLocalStorage implements AsyncLocalStorageInterface {
  private current: unknown

  getStore() {
    return this.current
  }

  run<T>(store: unknown, callback: () => T): T {
    this.current = store
    return callback()
  }

  enterWith(store: unknown) {
    this.current = store
  }
}

let initialized = false

export function ensureLangGraphAsyncContext() {
  if (initialized) return
  initialized = true
  AsyncLocalStorageProviderSingleton.initializeGlobalInstance(new BrowserAsyncLocalStorage())
}
