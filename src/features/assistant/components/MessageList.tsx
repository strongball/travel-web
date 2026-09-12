import { useEffect, useState } from 'react'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import ForumRoundedIcon from '@mui/icons-material/ForumRounded'
import UnfoldMoreRoundedIcon from '@mui/icons-material/UnfoldMoreRounded'
import {
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
  styled,
} from '@mui/material'
import { useRiverWatch } from '@stball/react-river'
import { assistantConversationsProvider } from '../providers'
import type {
  AssistantProposal,
  AssistantQuestionDecision,
} from '../types'
import { isPendingProposalCall, isPendingQuestionCall } from '../types'
import { useActiveTurnScroll } from '../hooks'
import { MessageBubble } from './MessageBubble'
import { ProposalCard } from './ProposalCard'
import { ClarifyingQuestionCard } from './ClarifyingQuestionCard'
import { AssistantProgress, ConversationLoading } from './AssistantProgress'

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

const INITIAL_VISIBLE_COUNT = 40

const quickPrompts = [
  '幫我整理這趟旅行的行前準備與打包清單',
  '根據目前行程，幫我列出需要預約或準備的待辦事項',
  '推薦今天附近熱門景點',
  '幫我檢查行程動線與時間是否太趕',
]

function WelcomeCard({ onQuickPrompt }: { onQuickPrompt: (text: string) => void }) {
  return (
    <Paper
      elevation={0}
      sx={{
        alignSelf: 'center',
        maxWidth: 540,
        width: '100%',
        mt: { xs: 2, sm: 4 },
        p: { xs: 2.5, sm: 3.5 },
        textAlign: 'center',
        borderRadius: 4,
        border: '1px solid rgba(13, 118, 110, 0.12)',
        bgcolor: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 30px rgba(13, 118, 110, 0.06)',
      }}
    >
      <Avatar
        sx={{
          width: 56,
          height: 56,
          mx: 'auto',
          mb: 1.5,
          background: 'linear-gradient(135deg, #0d766e 0%, #14b8a6 100%)',
          boxShadow: '0 4px 16px rgba(13, 118, 110, 0.3)',
        }}
      >
        <AutoAwesomeRoundedIcon sx={{ fontSize: 30, color: '#ffffff' }} />
      </Avatar>
      <Typography
        variant="h6"
        sx={{
          fontWeight: 900,
          letterSpacing: '-0.02em',
          color: '#0d766e',
        }}
      >
        嗨！想怎麼規劃這趟旅程？
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mt: 0.75, lineHeight: 1.6, px: { xs: 1, sm: 2 } }}
      >
        隨時告訴我你想去的景點、詢問動線建議，或直接說明要修改哪一天的行程。
      </Typography>

      <Divider sx={{ my: 2.25, borderColor: 'rgba(13, 118, 110, 0.08)' }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
          推薦快捷提問
        </Typography>
      </Divider>

      <Stack
        direction="row"
        useFlexGap
        spacing={1}
        sx={{ justifyContent: 'center', flexWrap: 'wrap' }}
      >
        {quickPrompts.map((prompt) => (
          <Chip
            key={prompt}
            label={prompt}
            onClick={() => onQuickPrompt(prompt)}
            sx={{
              py: 2.2,
              px: 1,
              borderRadius: 3,
              fontWeight: 650,
              fontSize: '0.84rem',
              bgcolor: 'rgba(13, 118, 110, 0.06)',
              border: '1px solid rgba(13, 118, 110, 0.15)',
              color: '#0d766e',
              transition: 'all 180ms ease',
              '&:hover': {
                bgcolor: 'rgba(13, 118, 110, 0.12)',
                borderColor: '#0d766e',
                transform: 'translateY(-1px)',
              },
              '&:active': {
                transform: 'scale(0.98)',
              },
            }}
          />
        ))}
      </Stack>
    </Paper>
  )
}

export function MessageList({
  itineraryId,
  threadId,
  online,
  onQuickPrompt,
  onDecision,
  onQuestionAnswer,
}: {
  itineraryId: string
  /** 目標對話;訊息與生成中的狀態由此元件自行訂閱(graph → river → component)。 */
  threadId: string | null
  online: boolean
  /** 快捷提問寫入輸入草稿。 */
  onQuickPrompt: (text: string) => void
  onDecision: (proposal: AssistantProposal, approved: boolean) => void
  onQuestionAnswer?: (answer: AssistantQuestionDecision) => void
}) {
  const conversationState = useRiverWatch(
    assistantConversationsProvider({ itineraryId, threadId: threadId ?? '' }),
    { enabled: Boolean(threadId) },
  )

  const messages = conversationState?.data?.messages ?? []
  const turn = conversationState?.data?.turn ?? null
  const loading = Boolean(conversationState?.isLoading && !conversationState.hasData)
  const sending = turn?.phase === 'running'
  const isStreaming = Boolean(turn?.streaming || turn?.progressLabel)
  const pendingToolCall = turn?.pendingToolCall ?? null

  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setExpanded(false)
  }, [threadId])

  const hasMore = messages.length > INITIAL_VISIBLE_COUNT
  const visibleMessages = expanded || !hasMore
    ? messages
    : messages.slice(messages.length - INITIAL_VISIBLE_COUNT)

  const {
    activeTurnSpacerHeight,
    activeTurnSpacerRef,
    lastUserMessageIndex,
    lastUserMessageRef,
    messagesAreaRef,
    messagesEndRef,
  } = useActiveTurnScroll(visibleMessages, sending || isStreaming)

  const hasMessages = visibleMessages.length > 0

  if (!threadId) {
    return (
      <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 3 }}>
        <Paper
          elevation={0}
          sx={{
            p: 3.5,
            textAlign: 'center',
            borderRadius: 3.5,
            border: '1px solid rgba(13, 118, 110, 0.1)',
            bgcolor: 'rgba(255, 255, 255, 0.8)',
          }}
        >
          <ForumRoundedIcon color="action" sx={{ fontSize: 44, opacity: 0.7 }} />
          <Typography sx={{ mt: 1, fontWeight: 800 }}>選擇一個對話</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            從左側清單挑選對話，或點擊「+」建立新對話。
          </Typography>
        </Paper>
      </Box>
    )
  }

  return (
    <StyledMessagesContainer ref={messagesAreaRef} spacing={2} key={threadId}>
      {loading && !hasMessages && (
        <Box sx={{ textAlign: 'center', m: 'auto', p: 3 }}>
          <ConversationLoading />
        </Box>
      )}

      {!loading && !hasMessages && (
        <WelcomeCard onQuickPrompt={onQuickPrompt} />
      )}

      {hasMessages && hasMore && !expanded && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<UnfoldMoreRoundedIcon sx={{ fontSize: 18 }} />}
            onClick={() => setExpanded(true)}
            sx={{
              borderRadius: 999,
              fontSize: '0.8rem',
              fontWeight: 650,
              color: '#0d766e',
              borderColor: 'rgba(13, 118, 110, 0.25)',
              bgcolor: 'rgba(13, 118, 110, 0.04)',
              '&:hover': {
                borderColor: '#0d766e',
                bgcolor: 'rgba(13, 118, 110, 0.08)',
              },
            }}
          >
            載入更早的 {messages.length - INITIAL_VISIBLE_COUNT} 則對話
          </Button>
        </Box>
      )}

      {visibleMessages.map((message, index) => (
        <Stack
          key={message.id}
          ref={index === lastUserMessageIndex ? lastUserMessageRef : undefined}
          data-message-id={message.id}
          spacing={1.25}
        >
          <MessageBubble message={message} />
          {message.role === 'assistant' && message.clarifyingQuestion ? (
            <ClarifyingQuestionCard
              questionData={{
                question: message.clarifyingQuestion.question,
                options: message.clarifyingQuestion.options ?? [],
              }}
              answeredAnswer={message.clarifyingQuestion.answer}
              isHistory={true}
            />
          ) : null}
          {message.role === 'assistant' && message.proposal ? (
            <ProposalCard
              key={message.proposal.id}
              proposal={message.proposal}
              busy={sending}
              online={online}
              onDecision={onDecision}
              isHistory={true}
            />
          ) : null}
        </Stack>
      ))}

      {isStreaming && (
        <Stack spacing={1.25}>
          {turn?.streaming ? (
            <MessageBubble message={turn.streaming} streaming />
          ) : (
            <AssistantProgress label={turn?.progressLabel || '正在思考並產生回覆…'} />
          )}
        </Stack>
      )}

      {pendingToolCall && isPendingQuestionCall(pendingToolCall) && (
        <Stack data-tool-call-id={pendingToolCall.id} spacing={1.25}>
          <ClarifyingQuestionCard
            questionData={pendingToolCall.questionData}
            busy={sending}
            online={online}
            onAnswer={onQuestionAnswer}
            isHistory={false}
          />
        </Stack>
      )}

      {pendingToolCall && isPendingProposalCall(pendingToolCall) && (
        <Stack data-tool-call-id={pendingToolCall.id} spacing={1.25}>
          <ProposalCard
            proposal={pendingToolCall.proposal}
            busy={sending}
            online={online}
            onDecision={onDecision}
            isHistory={false}
          />
        </Stack>
      )}

      <StyledActiveTurnSpacer
        ref={activeTurnSpacerRef}
        sx={{
          height: activeTurnSpacerHeight > 0 ? activeTurnSpacerHeight : (sending ? '100%' : 0),
          minHeight: sending ? '100%' : 0,
        }}
      />

      <div ref={messagesEndRef} />
    </StyledMessagesContainer>
  )
}

