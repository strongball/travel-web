import { type RefObject } from 'react'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import ForumRoundedIcon from '@mui/icons-material/ForumRounded'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import type { StoredAssistantProposal } from '../../../lib/repositories/assistantRepository'
import type { AssistantConversationController } from '../useAssistantConversation'
import { MessageBubble } from './MessageBubble'
import { ProposalCard } from './ProposalCard'
import { AssistantProgress, ConversationLoading } from './AssistantProgress'

export const quickPrompts = [
  '幫我整理這趟旅行的行前準備與打包清單',
  '根據目前行程，幫我列出需要預約或準備的待辦事項',
  '推薦今天附近熱門景點',
  '幫我檢查行程動線與時間是否太趕',
]

export function MessageList({
  controller,
  scrollRef,
  onScroll,
}: {
  controller: AssistantConversationController
  scrollRef: RefObject<HTMLDivElement | null>
  onScroll: (event: React.UIEvent<HTMLDivElement>) => void
}) {
  const {
    threadId,
    messages,
    pendingToolCall,
    conversationLoading,
    online,
    sending,
    rejectingProposalId,
    progressLabel,
    error,
    notice,
    canRetry,
  } = controller

  return (
    <Stack
      ref={scrollRef}
      spacing={2}
      onScroll={onScroll}
      sx={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        p: { xs: 1.5, sm: 2.5 },
        overflowY: 'auto',
        bgcolor: '#f6f9f8',
        backgroundImage: 'radial-gradient(rgba(13, 118, 110, 0.04) 1px, transparent 1px)',
        backgroundSize: '16px 16px',
      }}
    >
      {!threadId ? (
        <Paper
          elevation={0}
          sx={{
            alignSelf: 'center',
            mt: 8,
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
      ) : conversationLoading ? (
        <ConversationLoading />
      ) : messages.length === 0 && !pendingToolCall ? (
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
                onClick={() => controller.setText(prompt)}
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
      ) : (
        <>
          {messages.map((message) => {
            const messageProposal = message.proposal as StoredAssistantProposal | undefined
            return (
              <Stack key={message.id} data-message-id={message.id} spacing={1.25}>
                <MessageBubble message={message} />
                {message.role === 'assistant' && messageProposal ? (
                  <ProposalCard
                    key={messageProposal.id}
                    proposal={messageProposal}
                    busy={sending || rejectingProposalId === messageProposal.id}
                    online={online}
                    onDecision={controller.decideProposal}
                  />
                ) : null}
              </Stack>
            )
          })}
          {pendingToolCall ? (
            <Stack data-tool-call-id={pendingToolCall.id} spacing={1.25}>
              <ProposalCard
                proposal={pendingToolCall.proposal}
                busy={sending || rejectingProposalId === pendingToolCall.proposal.id}
                online={online}
                onDecision={controller.decideProposal}
              />
            </Stack>
          ) : null}
        </>
      )}

      {sending && (!messages.length || messages[messages.length - 1]?.role === 'user') ? (
        <AssistantProgress label={progressLabel || '正在根據行程整理回覆…'} />
      ) : null}

      {!online ? (
        <Alert severity="info" variant="outlined" sx={{ flexShrink: 0, borderRadius: 2.5 }}>
          助理與行程確認需要網路連線。
        </Alert>
      ) : null}
      {notice ? (
        <Alert
          severity="warning"
          variant="outlined"
          onClose={controller.clearNotice}
          sx={{ flexShrink: 0, borderRadius: 2.5 }}
        >
          {notice}
        </Alert>
      ) : null}
      {error ? (
        <Alert
          severity="error"
          variant="outlined"
          onClose={controller.clearError}
          sx={{ flexShrink: 0, borderRadius: 2.5 }}
        >
          {error}
        </Alert>
      ) : null}
      {canRetry ? (
        <Alert
          severity="warning"
          variant="outlined"
          sx={{ flexShrink: 0, borderRadius: 2.5 }}
          action={
            <Button
              color="inherit"
              size="small"
              disabled={sending || !online}
              onClick={() => void controller.retryLastTurn()}
            >
              重試
            </Button>
          }
        >
          上次回覆未完成，這個回合可以安全重試。
        </Alert>
      ) : null}

      <Box sx={{ minHeight: { xs: 16, sm: 24 }, flexShrink: 0 }} />
    </Stack>
  )
}
