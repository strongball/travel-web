import { providerFamily, stateProviderFamily } from '@stball/react-river'

import {
  createAssistantRuntime,
  type AssistantConversationRuntime,
} from '../services'
import { assistantThreadsProvider } from './assistantThreadsProvider'
import { expensesProvider } from '../../../providers/expensesProvider'
import { itinerariesProvider } from '../../../providers/itinerariesProvider'
import { todosProvider } from '../../../providers/todosProvider'

export const assistantNoticeProvider = stateProviderFamily<string | null, string>(
  () => null,
  { name: 'assistantNotice' },
)

/**
 * 一個旅程共用一份 graph runtime。非序列化資源由 River scope 持有，
 * 對話 provider 與 turn actions 只需依 itineraryId 取得它。
 */
export const assistantRuntimeProvider = providerFamily<AssistantConversationRuntime, string>(
  (ref, itineraryId) => {
    const notify = (message: string) => {
      ref.read(assistantNoticeProvider(itineraryId).notifier).state = message
    }
    return {
      ...createAssistantRuntime(
        async () => {
          await Promise.all([
            ref.read(itinerariesProvider.notifier).refresh(),
            ref.read(expensesProvider.notifier).refresh(),
            ref.read(todosProvider.notifier).refresh(),
          ])
        },
        notify,
      ),
      updateSummary: (threadId, summary) =>
        ref.read(assistantThreadsProvider(itineraryId).notifier).updateSummary(threadId, summary),
      onNotice: notify,
    }
  },
  { name: 'assistantRuntime', ssr: false },
)
