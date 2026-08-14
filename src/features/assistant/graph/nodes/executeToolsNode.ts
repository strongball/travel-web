import { ToolNode } from '@langchain/langgraph/prebuilt'
import type { ToolMessage } from '@langchain/core/messages'
import { langchainAssistantTools } from '../../tools'
import type { AssistantGraphNodeState } from '../graphState'

export function createExecuteToolsNode() {
  const toolNode = new ToolNode(langchainAssistantTools, { handleToolErrors: false })

  return async (state: AssistantGraphNodeState) => {
    const output = await toolNode.invoke({ messages: state.modelMessages }) as { messages: ToolMessage[] }
    return {
      modelMessages: [...state.modelMessages, ...output.messages],
      toolRound: state.toolRound + 1,
    }
  }
}
