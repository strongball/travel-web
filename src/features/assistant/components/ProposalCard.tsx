import { useState } from 'react'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import {
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
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
  const [changesExpanded, setChangesExpanded] = useState(proposal.status === 'pending')
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
          />
        )
      case 'applied':
        return (
          <Chip
            size="small"
            icon={<CheckCircleRoundedIcon fontSize="small" />}
            label="已成功套用"
            color="success"
          />
        )
      case 'expired':
        return (
          <Chip
            size="small"
            label="行程已異動，提案已過期"
          />
        )
      case 'pending':
        return (
          <Chip
            size="small"
            label="待確認"
            color="warning"
          />
        )
      default:
        return (
          <Chip
            size="small"
            label="未套用"
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
    <Card
      sx={{
        alignSelf: 'flex-start',
        width: 'min(100%, 680px)',
        p: { xs: 1.75, sm: 2.25 },
        borderWidth: proposal.status === 'pending' ? '1.5px' : '1px',
        borderColor: proposal.status === 'pending' ? 'primary.main' : undefined,
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
              bgcolor: 'primary.main',
              color: 'common.white',
            }}
          >
            <AutoAwesomeRoundedIcon sx={{ fontSize: 14 }} />
          </Avatar>
          <Typography color="primary.main" sx={{ fontWeight: 900 }}>
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
          {proposal.explanation}
        </Typography>
      </Box>

      {compactable ? (
        <Button
          size="small"
          aria-expanded={changesExpanded}
          aria-controls={changesId}
          onClick={() => setChangesExpanded((expanded) => !expanded)}
          sx={{ mt: 1 }}
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
          >
            不套用，繼續討論
          </Button>
          <Button
            variant="contained"
            disabled={busy || !online}
            onClick={() => onDecision(proposal, true)}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CheckCircleRoundedIcon />}
          >
            確認儲存並套用
          </Button>
        </Stack>
      ) : null}
    </Card>
  )
}
