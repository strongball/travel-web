import { useState } from 'react'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import type { StoredAssistantProposal } from '../../../lib/repositories/assistantRepository'
import { ItineraryProposalView, TodoProposalView } from '../tools'

export function ProposalCard({
  proposal,
  busy,
  online,
  onDecision,
}: {
  proposal: StoredAssistantProposal
  busy: boolean
  online: boolean
  onDecision: (proposal: StoredAssistantProposal, approved: boolean) => void
}) {
  const [changesExpanded, setChangesExpanded] = useState(false)
  const compactable =
    proposal.status === 'applied' ||
    proposal.status === 'rejected' ||
    proposal.status === 'expired'
  const showChanges = !compactable || changesExpanded
  const changesId = `proposal-${proposal.id}-changes`

  const statusChip = (() => {
    switch (proposal.status) {
      case 'approved':
        return (
          <Chip
            size="small"
            icon={<CircularProgress size={12} color="inherit" />}
            label="正在套用…"
            color="primary"
            sx={{ fontWeight: 800 }}
          />
        )
      case 'applied':
        return (
          <Chip
            size="small"
            icon={<CheckCircleRoundedIcon fontSize="small" />}
            label="已成功套用"
            sx={{
              bgcolor: 'rgba(16, 185, 129, 0.12)',
              color: '#059669',
              fontWeight: 800,
            }}
          />
        )
      case 'expired':
        return (
          <Chip
            size="small"
            label="行程已異動，提案已過期"
            sx={{ bgcolor: 'rgba(0,0,0,0.06)', color: 'text.secondary', fontWeight: 700 }}
          />
        )
      case 'pending':
        return (
          <Chip
            size="small"
            label="待確認"
            sx={{
              bgcolor: 'rgba(238, 124, 69, 0.12)',
              color: '#d95a1c',
              fontWeight: 800,
            }}
          />
        )
      default:
        return (
          <Chip
            size="small"
            label="未套用"
            sx={{ bgcolor: 'rgba(0,0,0,0.06)', color: 'text.secondary', fontWeight: 700 }}
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

  return (
    <Paper
      elevation={0}
      sx={{
        alignSelf: 'flex-start',
        width: 'min(100%, 680px)',
        p: { xs: 1.75, sm: 2.25 },
        borderRadius: 3.5,
        border:
          proposal.status === 'pending'
            ? '1.5px solid #0d766e'
            : '1px solid rgba(13, 118, 110, 0.12)',
        bgcolor: '#ffffff',
        boxShadow:
          proposal.status === 'pending'
            ? '0 6px 24px rgba(13, 118, 110, 0.1)'
            : '0 2px 10px rgba(0, 0, 0, 0.04)',
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
              width: 26,
              height: 26,
              background: 'linear-gradient(135deg, #0d766e 0%, #14b8a6 100%)',
            }}
          >
            <AutoAwesomeRoundedIcon sx={{ fontSize: 14, color: '#ffffff' }} />
          </Avatar>
          <Typography sx={{ fontWeight: 900, color: '#0d766e', fontSize: '0.96rem' }}>
            {proposalTitle}
          </Typography>
        </Stack>
        {statusChip}
      </Stack>

      <Box
        sx={{
          mt: 1.5,
          p: 1.5,
          borderRadius: 2.5,
          bgcolor: 'rgba(13, 118, 110, 0.04)',
          borderLeft: '3px solid #0d766e',
        }}
      >
        <Typography variant="body2" sx={{ lineHeight: 1.6, color: 'text.primary' }}>
          {proposal.explanation}
        </Typography>
      </Box>

      {compactable ? (
        <Button
          size="small"
          aria-expanded={changesExpanded}
          aria-controls={changesId}
          onClick={() => setChangesExpanded((expanded) => !expanded)}
          sx={{ mt: 1, px: 1, borderRadius: 2, fontWeight: 700 }}
        >
          {changesExpanded ? '收合變更內容' : '查看變更內容'}
        </Button>
      ) : null}

      {showChanges ? (
        <Stack id={changesId} spacing={1.5} sx={{ mt: 1.75 }}>
          <TodoProposalView proposedTodos={proposedTodos} />
          <ItineraryProposalView afterDays={afterDays} beforeDays={beforeDays} />
        </Stack>
      ) : null}

      {proposal.status === 'pending' ? (
        <Stack
          direction={{ xs: 'column-reverse', sm: 'row' }}
          spacing={1}
          sx={{ mt: 2, justifyContent: 'flex-end' }}
        >
          <Button
            variant="outlined"
            disabled={busy || !online}
            onClick={() => onDecision(proposal, false)}
            sx={{ borderRadius: 2.5, px: 2, py: 1 }}
          >
            不套用，繼續討論
          </Button>
          <Button
            variant="contained"
            disabled={busy || !online}
            onClick={() => onDecision(proposal, true)}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CheckCircleRoundedIcon />}
            sx={{
              borderRadius: 2.5,
              px: 2.5,
              py: 1,
              background: 'linear-gradient(135deg, #0d766e 0%, #14b8a6 100%)',
              boxShadow: '0 4px 14px rgba(13, 118, 110, 0.3)',
              '&:hover': {
                background: 'linear-gradient(135deg, #075c57 0%, #0d766e 100%)',
              },
            }}
          >
            確認儲存並套用
          </Button>
        </Stack>
      ) : null}
    </Paper>
  )
}
