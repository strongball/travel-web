import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProposalCard } from './ProposalCard'
import type { StoredAssistantProposal } from '../../../lib/repositories/assistantRepository'

const sampleProposal: StoredAssistantProposal = {
  id: 'proposal-1',
  turnId: 'turn-1',
  threadId: 'thread-1',
  itineraryId: 'trip-1',
  title: '行程與待辦修改建議',
  explanation: '建議在第二天增加淺草寺，並新增購票提醒待辦。',
  status: 'pending',
  createdAt: '2026-08-22T11:00:00Z',
  expectedDayRevisions: { 'day-1': 1 },
  afterDays: [
    {
      id: 'day-1',
      itineraryId: 'trip-1',
      date: '2026-08-23',
      startTime: null,
      revision: 2,
      attractions: [
        {
          id: 'attr-1',
          dayId: 'day-1',
          name: '淺草寺',
          startTime: '2026-08-23T09:00:00Z',
          endTime: '2026-08-23T11:00:00Z',
          travelTime: 15,
          description: '',
          cost: 0,
          latitude: null,
          longitude: null,
          duration: 120,
          transportMode: null,
          placeId: null,
          locationName: null,
        },
      ],
    },
  ],
  beforeDays: [
    {
      id: 'day-1',
      itineraryId: 'trip-1',
      date: '2026-08-23',
      startTime: null,
      revision: 1,
      attractions: [],
    },
  ],
  proposedTodos: [
    { title: '購買晴空塔門票', category: '票券預約' },
  ],
  proposedCategories: ['票券預約'],
}

describe('ProposalCard', () => {
  it('renders expanded with action buttons when pending (inquiry moment)', () => {
    const onDecision = vi.fn()

    render(
      <ProposalCard
        proposal={sampleProposal}
        busy={false}
        online={true}
        onDecision={onDecision}
        isHistory={false}
      />,
    )

    // Should show explanation and details directly without needing click
    expect(screen.getByText('行程與待辦修改建議')).toBeInTheDocument()
    expect(screen.getByText('待確認')).toBeInTheDocument()
    expect(screen.getByText('建議在第二天增加淺草寺，並新增購票提醒待辦。')).toBeInTheDocument()
    expect(screen.getByText('建議新增待辦項目')).toBeInTheDocument()
    expect(screen.getByText('購買晴空塔門票')).toBeInTheDocument()

    // Action buttons should be visible
    const approveBtn = screen.getByRole('button', { name: /確認儲存並套用/i })
    const rejectBtn = screen.getByRole('button', { name: /不套用，繼續討論/i })
    expect(approveBtn).toBeInTheDocument()
    expect(rejectBtn).toBeInTheDocument()

    fireEvent.click(approveBtn)
    expect(onDecision).toHaveBeenCalledWith(sampleProposal, true)

    fireEvent.click(rejectBtn)
    expect(onDecision).toHaveBeenCalledWith(sampleProposal, false)
  })

  it('renders collapsed in history mode and expands on toggle click', () => {
    const onDecision = vi.fn()
    const appliedProposal: StoredAssistantProposal = {
      ...sampleProposal,
      status: 'applied',
    }

    render(
      <ProposalCard
        proposal={appliedProposal}
        busy={false}
        online={true}
        onDecision={onDecision}
        isHistory={true}
      />,
    )

    // Header and status should be visible
    expect(screen.getByText('行程與待辦修改建議')).toBeInTheDocument()
    expect(screen.getByText('已成功套用')).toBeInTheDocument()
    expect(screen.getByText('查看建議')).toBeInTheDocument()

    // Inner content should NOT be in DOM initially when collapsed (due to unmountOnExit)
    expect(screen.queryByText('建議在第二天增加淺草寺，並新增購票提醒待辦。')).not.toBeInTheDocument()
    expect(screen.queryByText('建議新增待辦項目')).not.toBeInTheDocument()

    // Toggle button / header should exist
    const toggleButton = screen.getByRole('button', { name: /行程與待辦修改建議/i })
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false')

    // Click to expand
    fireEvent.click(toggleButton)
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('收合內容')).toBeInTheDocument()
    expect(screen.getByText('建議在第二天增加淺草寺，並新增購票提醒待辦。')).toBeInTheDocument()
    expect(screen.getByText('建議新增待辦項目')).toBeInTheDocument()
    expect(screen.getByText('購買晴空塔門票')).toBeInTheDocument()

    // Click again to collapse
    fireEvent.click(toggleButton)
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('查看建議')).toBeInTheDocument()
  })

  it('defaults isHistorical to true when proposal.status is not pending', () => {
    const rejectedProposal: StoredAssistantProposal = {
      ...sampleProposal,
      status: 'rejected',
    }

    render(
      <ProposalCard
        proposal={rejectedProposal}
        busy={false}
        online={true}
        onDecision={vi.fn()}
      />,
    )

    // Should render collapsed by default because status is 'rejected'
    expect(screen.getByText('未套用')).toBeInTheDocument()
    expect(screen.queryByText('建議在第二天增加淺草寺，並新增購票提醒待辦。')).not.toBeInTheDocument()
  })
})
