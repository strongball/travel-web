import React, { type ReactNode, type RefObject } from 'react'
import { Box, Stack, styled } from '@mui/material'
import { useActiveTurnScroll } from './useActiveTurnScroll'

const StyledMessagesContainer = styled(Stack)(({ theme }) => ({
  flex: 1,
  minHeight: 0,
  padding: theme.spacing(2),
  overflowY: 'auto',
  position: 'relative',
  backgroundColor: '#f6f9f8',
  backgroundImage: 'radial-gradient(rgba(13, 118, 110, 0.04) 1px, transparent 1px)',
  backgroundSize: '16px 16px',

  '& > *': {
    minWidth: 0,
  },
}))

const StyledActiveTurnSpacer = styled(Box)({
  flexShrink: 0,
  pointerEvents: 'none',
})

const DEFAULT_HISTORY_LOADING = '載入對話中…'

export interface ConversationMessageRenderContext<TMessage> {
  message: TMessage
  history: TMessage[]
  messageRef?: RefObject<HTMLDivElement | null>
  userLabel?: string
  assistantLabel?: string
}

export interface ConversationStreamingRenderContext<TStreamingState> {
  state: TStreamingState | null
  isConnecting: boolean
}

export interface ConversationInterruptRenderContext<TInterrupt, TResumeInput> {
  interrupt: TInterrupt
  isBusy?: boolean
  resume: (input: TResumeInput) => void
}

export interface ConversationThreadProps<
  TMessage extends { id: string; role: string } = any,
  TStreamingState = unknown,
  TInterrupt = unknown,
  TResumeInput = unknown,
> {
  messages: TMessage[]
  isHistoryLoading?: boolean
  historyLoading?: ReactNode
  emptyState?: ReactNode
  userLabel?: string
  assistantLabel?: string
  renderMessage: (context: ConversationMessageRenderContext<TMessage>) => ReactNode
  isStreaming?: boolean
  streamingState?: TStreamingState | null
  interrupt?: TInterrupt | null
  error?: unknown
  isBusy?: boolean
  renderStreaming?: (context: ConversationStreamingRenderContext<TStreamingState>) => ReactNode
  renderInterrupt?: (context: ConversationInterruptRenderContext<TInterrupt, TResumeInput>) => ReactNode
  renderError?: (error: unknown) => ReactNode
  renderTail?: ReactNode
  onResume?: (input: TResumeInput) => void
}

/**
 * Controlled conversation viewport. Data, streaming state, interrupts, and
 * actions all come from the parent; this component only composes the view.
 */
export function ConversationThread<
  TMessage extends { id: string; role: string } = any,
  TStreamingState = unknown,
  TInterrupt = unknown,
  TResumeInput = unknown,
>(props: ConversationThreadProps<TMessage, TStreamingState, TInterrupt, TResumeInput>) {
  const {
    messages,
    isHistoryLoading = false,
    historyLoading = DEFAULT_HISTORY_LOADING,
    emptyState,
    userLabel,
    assistantLabel,
    renderMessage,
    isStreaming = false,
    streamingState,
    interrupt,
    error,
    isBusy = false,
    renderStreaming,
    renderInterrupt,
    renderError,
    renderTail,
    onResume,
  } = props

  const {
    activeTurnSpacerHeight,
    activeTurnSpacerRef,
    lastUserMessageIndex,
    lastUserMessageRef,
    messagesAreaRef,
    messagesEndRef,
  } = useActiveTurnScroll(messages, isBusy || isStreaming)

  const hasMessages = messages.length > 0

  return (
    <StyledMessagesContainer ref={messagesAreaRef} spacing={2}>
      {isHistoryLoading && !hasMessages && (
        <Box sx={{ textAlign: 'center', m: 'auto', p: 3 }}>{historyLoading}</Box>
      )}

      {!isHistoryLoading && !hasMessages && emptyState}

      {messages.map((message, index) => {
        const renderedMessage = renderMessage({
          message,
          history: messages,
          messageRef: index === lastUserMessageIndex ? lastUserMessageRef : undefined,
          userLabel,
          assistantLabel,
        })

        return renderedMessage == null ? null : (
          <React.Fragment key={message.id}>{renderedMessage}</React.Fragment>
        )
      })}

      {renderStreaming &&
        isStreaming &&
        renderStreaming({
          state: streamingState ?? null,
          isConnecting: streamingState == null,
        })}

      {interrupt != null &&
        renderInterrupt &&
        onResume &&
        renderInterrupt({
          interrupt,
          isBusy,
          resume: onResume,
        })}

      {error != null && renderError?.(error)}

      {renderTail}

      <StyledActiveTurnSpacer
        ref={activeTurnSpacerRef}
        sx={{ height: activeTurnSpacerHeight > 0 ? activeTurnSpacerHeight : 0 }}
      />

      <div ref={messagesEndRef} />
    </StyledMessagesContainer>
  )
}
