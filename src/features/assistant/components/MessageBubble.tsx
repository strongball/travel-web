import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import {
  Avatar,
  Box,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import ReactMarkdown from 'react-markdown'
import type { AssistantMessage } from '../types'
import { formatAssistantText } from '../utils/formatAssistantText'
import { AssistantToolExecutionBadge } from './AssistantToolExecutionBadge'

const timeLabel = (value: string) =>
  new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))

export function MessageBubble({
  message,
  streaming = false,
}: {
  message: AssistantMessage
  streaming?: boolean
}) {
  const user = message.role === 'user'
  return (
    <Stack direction={user ? 'row-reverse' : 'row'} spacing={1.25} sx={{ alignItems: 'flex-start' }}>
      {!user ? (
        <Avatar
          sx={{
            width: 32,
            height: 32,
            mt: 0.25,
            background: (theme) => theme.palette.primaryGradient,
            boxShadow: (theme) => theme.palette.cardShadow,
            flexShrink: 0,
          }}
        >
          <AutoAwesomeRoundedIcon sx={{ fontSize: 17, color: '#ffffff' }} />
        </Avatar>
      ) : null}
      <Box sx={{ maxWidth: { xs: '88%', sm: '78%' } }}>
        {!user && (message.grounding || message.codeExecutions || (message.toolCalls && message.toolCalls.length > 0)) ? (
          <AssistantToolExecutionBadge
            grounding={message.grounding}
            codeExecutions={message.codeExecutions}
            toolCalls={message.toolCalls}
          />
        ) : null}
        <Paper
          elevation={0}
          data-streaming={streaming ? 'true' : undefined}
          aria-busy={streaming || undefined}
          sx={{
            px: { xs: 1.75, sm: 2 },
            py: 1.25,
            borderRadius: user ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
            background: user
              ? (theme) => theme.palette.primaryGradient
              : undefined,
            bgcolor: user ? undefined : 'background.paper',
            color: user ? '#ffffff' : 'text.primary',
            border: user ? 'none' : '1px solid',
            borderColor: user ? 'transparent' : 'surfaceSubtleBorder',
            boxShadow: user
              ? '0 3px 12px rgba(13, 118, 110, 0.22)'
              : (theme) => theme.palette.cardShadow,
            overflowWrap: 'anywhere',
            fontSize: { xs: '0.9rem', sm: '0.94rem' },
            lineHeight: 1.68,
            '& p': {
              m: 0,
              mb: 0.75,
              '&:last-child': { mb: 0 },
            },
            '& h1, & h2, & h3, & h4, & h5, & h6': {
              fontWeight: 700,
              mt: 1.2,
              mb: 0.5,
              lineHeight: 1.3,
              '&:first-of-type': { mt: 0 },
            },
            '& h1': { fontSize: '1.25rem' },
            '& h2': { fontSize: '1.12rem' },
            '& h3': { fontSize: '1.02rem' },
            '& h4, & h5, & h6': { fontSize: '0.95rem' },
            '& ul, & ol': {
              mt: 0.25,
              mb: 0.75,
              pl: 2.25,
              '&:last-child': { mb: 0 },
            },
            '& li': {
              mb: 0.25,
              '&:last-child': { mb: 0 },
            },
            '& strong': {
              fontWeight: 700,
              color: user ? '#ffffff' : 'text.primary',
            },
            '& a': {
              color: user ? '#5eead4' : 'primary.main',
              textDecoration: 'underline',
              '&:hover': { opacity: 0.85 },
            },
            '& code': {
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '0.85em',
              px: 0.6,
              py: 0.15,
              borderRadius: '4px',
              background: user ? 'rgba(255, 255, 255, 0.2)' : 'action.hover',
              color: user ? '#ffffff' : 'primary.main',
            },
            '& pre': {
              m: 0,
              my: 0.75,
              p: 1.25,
              borderRadius: '8px',
              background: user ? 'rgba(0, 0, 0, 0.35)' : (theme) => theme.palette.codeBackground,
              color: '#f8fafc',
              overflowX: 'auto',
              fontSize: '0.84em',
              '& code': {
                background: 'transparent',
                color: 'inherit',
                p: 0,
              },
            },
            '& blockquote': {
              m: 0,
              my: 0.75,
              pl: 1.25,
              py: 0.25,
              borderLeft: (theme) => `3px solid ${user ? '#5eead4' : theme.palette.primary.main}`,
              background: user ? 'rgba(255, 255, 255, 0.08)' : (theme) => theme.palette.surfaceSubtle,
              borderRadius: '0 6px 6px 0',
              fontStyle: 'italic',
            },
            '& hr': {
              my: 1,
              border: 'none',
              borderTop: (theme) => `1px solid ${user ? 'rgba(255, 255, 255, 0.2)' : theme.palette.divider}`,
            },
            '& table': {
              width: '100%',
              my: 0.75,
              borderCollapse: 'collapse',
              fontSize: '0.88em',
              '& th, & td': {
                border: (theme) => `1px solid ${user ? 'rgba(255, 255, 255, 0.25)' : theme.palette.divider}`,
                p: 0.6,
                textAlign: 'left',
              },
              '& th': {
                background: user ? 'rgba(255, 255, 255, 0.15)' : 'action.hover',
                fontWeight: 600,
              },
            },
            '& .assistant-typing-caret': {
              display: 'inline-block',
              ml: 0.25,
              color: user ? '#99f6e4' : 'primary.main',
              fontWeight: 800,
              animation: 'assistant-caret-blink 1s steps(2, start) infinite',
            },
            '@keyframes assistant-caret-blink': {
              '0%, 45%': { opacity: 1 },
              '46%, 100%': { opacity: 0 },
            },
          }}
        >
          {message.attachments && message.attachments.length > 0 ? (
            <Stack spacing={1} sx={{ mb: message.content ? 1 : 0 }}>
              {message.attachments.map((att) => (
                <Box key={att.id}>
                  {att.mimeType.startsWith('image/') && att.dataUrl ? (
                    <Box
                      component="img"
                      src={att.dataUrl}
                      alt={att.name}
                      sx={{
                        maxWidth: '100%',
                        maxHeight: 280,
                        borderRadius: 2,
                        objectFit: 'contain',
                        bgcolor: 'action.hover',
                        border: '1px solid',
                        borderColor: user ? 'rgba(255,255,255,0.2)' : 'divider',
                      }}
                    />
                  ) : (
                    <Stack
                      direction="row"
                      spacing={0.75}
                      sx={{
                        alignItems: 'center',
                        p: 0.75,
                        px: 1.25,
                        borderRadius: 2,
                        bgcolor: user ? 'rgba(255,255,255,0.15)' : 'action.hover',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                      }}
                    >
                      <span>📎</span>
                      <Typography noWrap variant="caption" sx={{ fontWeight: 700, color: 'inherit' }}>
                        {att.name}
                      </Typography>
                    </Stack>
                  )}
                </Box>
              ))}
            </Stack>
          ) : null}
          {message.content ? (
            <ReactMarkdown
              components={{
                a: ({ node: _node, ...props }) => (
                  <a target="_blank" rel="noopener noreferrer" {...props} />
                ),
              }}
            >
              {formatAssistantText(message.content)}
            </ReactMarkdown>
          ) : null}
          {streaming ? (
            <Box component="span" className="assistant-typing-caret" aria-hidden="true">
              ▍
            </Box>
          ) : null}
        </Paper>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: 'block',
            mt: 0.4,
            fontSize: '0.72rem',
            textAlign: user ? 'right' : 'left',
            px: 0.75,
          }}
        >
          {user ? '你' : '旅程助理'} · {timeLabel(message.createdAt)}
        </Typography>
      </Box>
    </Stack>
  )
}
