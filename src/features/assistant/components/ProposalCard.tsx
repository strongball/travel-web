import { useState } from 'react'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import {
  Avatar,
  Box,
  Button,
  ButtonBase,
  Card,
  Chip,
  CircularProgress,
  Collapse,
  Stack,
  Typography,
} from '@mui/material'
import type { StoredAssistantProposal } from '../../../lib/repositories/assistantRepository'
import { ItineraryProposalView, TodoProposalView } from '../tools'
import { formatAssistantText } from '../utils/formatAssistantText'

export function ProposalCard({
  proposal,
  busy,
  online,
  onDecision,
  isHistory,
}: {
  proposal: StoredAssistantProposal
  busy: boolean
  online: boolean
  onDecision: (proposal: StoredAssistantProposal, approved: boolean) => void
  isHistory?: boolean
}) {
  const isHistorical = isHistory ?? (proposal.status !== 'pending')
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const contentId = `proposal-${proposal.id}-content`

  const statusChip = (() => {
    switch (proposal.status) {
      case 'approved':
        return (
          <Chip
            size="small"
            icon={<CircularProgress size={12} color="inherit" />}
            label="正在套用…"
            color="primary"
            sx={{ height: 24, fontWeight: 700 }}
          />
        )
      case 'applied':
        return (
          <Chip
            size="small"
            icon={<CheckCircleRoundedIcon fontSize="small" />}
            label="已成功套用"
            color="success"
            sx={{ height: 24, fontWeight: 700 }}
          />
        )
      case 'expired':
        return (
          <Chip
            size="small"
            label="行程已異動，提案已過期"
            sx={{ height: 24, fontSize: '0.74rem' }}
          />
        )
      case 'pending':
        return (
          <Chip
            size="small"
            label="待確認"
            color="warning"
            sx={{ height: 24, fontWeight: 700 }}
          />
        )
      default:
        return (
          <Chip
            size="small"
            label="未套用"
            sx={{ height: 24, fontSize: '0.74rem' }}
          />
        )
    }
  })()

  const afterDays = proposal.afterDays ?? []
  const beforeDays = proposal.beforeDays ?? []
  const proposedTodos = proposal.proposedTodos ?? []
  const hasTodos = proposedTodos.length > 0
  const hasItineraryChanges = afterDays.length > 0

  const proposalTitle =
    hasTodos && hasItineraryChanges
      ? '行程與待辦修改建議'
      : hasTodos
      ? '待辦清單建議'
      : '行程修改建議'

  // History mode: Collapsed by default, expandable on click
  if (isHistorical) {
    return (
      <Card
        sx={{
          alignSelf: 'flex-start',
          width: 'min(100%, 680px)',
          borderRadius: 3,
          border: '1px solid rgba(13, 118, 110, 0.12)',
          bgcolor: '#ffffff',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
          overflow: 'hidden',
          transition: 'box-shadow 200ms ease, border-color 200ms ease',
          '&:hover': {
            borderColor: 'rgba(13, 118, 110, 0.25)',
            boxShadow: '0 4px 14px rgba(13, 118, 110, 0.08)',
          },
        }}
      >
        <ButtonBase
          onClick={() => setHistoryExpanded((prev) => !prev)}
          aria-expanded={historyExpanded}
          aria-controls={contentId}
          sx={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            p: { xs: 1.5, sm: 1.75 },
            bgcolor: historyExpanded ? 'rgba(13, 118, 110, 0.03)' : 'transparent',
            transition: 'background-color 180ms ease',
            '&:hover': {
              bgcolor: 'rgba(13, 118, 110, 0.05)',
            },
          }}
        >
          <Stack
            direction="row"
            spacing={1.25}
            sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0, flex: 1 }}>
              <Avatar
                sx={{
                  width: 28,
                  height: 28,
                  bgcolor: proposal.status === 'applied' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(13, 118, 110, 0.1)',
                  color: proposal.status === 'applied' ? 'success.main' : 'primary.main',
                  flexShrink: 0,
                }}
              >
                {proposal.status === 'applied' ? (
                  <CheckCircleRoundedIcon sx={{ fontSize: 16 }} />
                ) : (
                  <AutoAwesomeRoundedIcon sx={{ fontSize: 15 }} />
                )}
              </Avatar>
              <Typography
                noWrap
                sx={{
                  fontWeight: 750,
                  fontSize: { xs: '0.88rem', sm: '0.94rem' },
                  color: 'text.primary',
                }}
              >
                {proposalTitle}
              </Typography>
              <Box sx={{ flexShrink: 0 }}>{statusChip}</Box>
            </Stack>

            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'primary.main', flexShrink: 0 }}>
              <Typography
                variant="caption"
                sx={{
                  display: { xs: 'none', sm: 'inline-block' },
                  fontWeight: 700,
                  fontSize: '0.78rem',
                }}
              >
                {historyExpanded ? '收合內容' : '查看建議'}
              </Typography>
              <ExpandMoreRoundedIcon
                sx={{
                  fontSize: 20,
                  transform: historyExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 200ms ease',
                }}
              />
            </Stack>
          </Stack>
        </ButtonBase>

        <Collapse in={historyExpanded} timeout="auto" unmountOnExit>
          <Box
            id={contentId}
            sx={{
              px: { xs: 1.75, sm: 2.25 },
              pb: { xs: 1.75, sm: 2.25 },
              pt: 0.5,
              borderTop: '1px solid rgba(13, 118, 110, 0.08)',
            }}
          >
            <Box
              sx={{
                mt: 1,
                p: 1.5,
                borderRadius: 2,
                bgcolor: 'action.hover',
                borderLeft: '3px solid',
                borderColor: 'primary.main',
              }}
            >
              <Typography variant="body2" sx={{ lineHeight: 1.6, color: 'text.primary' }}>
                {formatAssistantText(proposal.explanation)}
              </Typography>
            </Box>

            <Stack spacing={1.5} sx={{ mt: 1.75 }}>
              <TodoProposalView proposedTodos={proposedTodos} />
              <ItineraryProposalView afterDays={afterDays} beforeDays={beforeDays} />
            </Stack>
          </Box>
        </Collapse>
      </Card>
    )
  }

  // Active Inquiry Mode (詢問的當下): Prominent, large, and fully expanded
  return (
    <Card
      sx={{
        alignSelf: 'flex-start',
        width: 'min(100%, 680px)',
        p: { xs: 1.75, sm: 2.25 },
        borderRadius: 3.5,
        borderWidth: '1.5px',
        borderColor: 'primary.main',
        boxShadow: '0 6px 24px rgba(13, 118, 110, 0.12)',
        bgcolor: '#ffffff',
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.5 }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Avatar
            sx={{
              width: 28,
              height: 28,
              background: 'linear-gradient(135deg, #0d766e 0%, #14b8a6 100%)',
              color: 'common.white',
              boxShadow: '0 2px 6px rgba(13, 118, 110, 0.25)',
            }}
          >
            <AutoAwesomeRoundedIcon sx={{ fontSize: 16 }} />
          </Avatar>
          <Typography color="primary.main" sx={{ fontWeight: 900, fontSize: { xs: '0.94rem', sm: '1.02rem' } }}>
            {proposalTitle}
          </Typography>
        </Stack>
        {statusChip}
      </Stack>

      <Box
        sx={{
          mt: 1.5,
          p: 1.5,
          borderRadius: 2,
          bgcolor: 'action.hover',
          borderLeft: '3px solid',
          borderColor: 'primary.main',
        }}
      >
        <Typography variant="body2" sx={{ lineHeight: 1.6, color: 'text.primary' }}>
          {formatAssistantText(proposal.explanation)}
        </Typography>
      </Box>

      <Stack spacing={1.5} sx={{ mt: 1.75 }}>
        <TodoProposalView proposedTodos={proposedTodos} />
        <ItineraryProposalView afterDays={afterDays} beforeDays={beforeDays} />
      </Stack>

      {proposal.status === 'pending' ? (
        <Stack
          direction={{ xs: 'column-reverse', sm: 'row' }}
          spacing={1}
          sx={{ mt: 2.25, justifyContent: 'flex-end' }}
        >
          <Button
            variant="outlined"
            disabled={busy || !online}
            onClick={() => onDecision(proposal, false)}
            sx={{ fontWeight: 700 }}
          >
            不套用，繼續討論
          </Button>
          <Button
            variant="contained"
            disabled={busy || !online}
            onClick={() => onDecision(proposal, true)}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CheckCircleRoundedIcon />}
            sx={{ fontWeight: 750, boxShadow: '0 3px 10px rgba(13, 118, 110, 0.3)' }}
          >
            確認儲存並套用
          </Button>
        </Stack>
      ) : null}
    </Card>
  )
}

