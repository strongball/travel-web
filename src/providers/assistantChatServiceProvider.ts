import { providerFamily } from '@stball/react-river'
import {
  createAssistantChatService,
  type AssistantChatService,
} from '../features/assistant/api/assistantChatService'
import { assistantRuntimeProvider } from './assistantRuntimeProvider'

export const assistantChatServiceProvider = providerFamily<AssistantChatService, string>(
  (ref, itineraryId) => {
    const runtime = ref.watch(assistantRuntimeProvider(itineraryId))
    return createAssistantChatService(runtime)
  },
  { name: 'assistantChatService', ssr: false },
)
