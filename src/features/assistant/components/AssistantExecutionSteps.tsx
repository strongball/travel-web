import { useState } from 'react'
import { Box, ButtonBase, Collapse, Link, Stack, Typography } from '@mui/material'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded'
import type { AssistantCodeExecution, AssistantExecutionStep, AssistantGroundingMetadata, AssistantToolCallRecord } from '../types'

const outputStyle = {
  whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 240, overflowY: 'auto',
  overscrollBehavior: 'contain', m: 0, p: 1, fontSize: '0.72rem', bgcolor: 'action.hover', borderRadius: 1,
} as const

type ExecutionRow = {
  key: string
  label: string
  call?: AssistantToolCallRecord
  step: AssistantExecutionStep
  results: NonNullable<AssistantExecutionStep['results']>
}

export function AssistantExecutionSteps({ steps = [], toolCalls = [], grounding, codeExecutions = [], running = false }: {
  steps?: AssistantExecutionStep[]
  toolCalls?: AssistantToolCallRecord[] | null
  grounding?: AssistantGroundingMetadata | null
  codeExecutions?: AssistantCodeExecution[] | null
  running?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const entries: AssistantExecutionStep[] = steps.length ? steps : (toolCalls ?? []).map((call) => ({ label: call.label, startedAt: 0, toolCalls: [call] }))
  const rows = entries.flatMap<ExecutionRow>((step, stepIndex) => step.toolCalls?.length
    ? step.toolCalls.map((call, index) => ({
      key: `tool-${stepIndex}-${call.id ?? index}`, label: call.label, call, step,
      results: step.results?.filter((result) => result.id === call.id) ?? [],
    }))
    : [{ key: `step-${stepIndex}`, label: step.label, call: undefined, step, results: [] }])
  const sources = (grounding?.sources ?? []).filter((source) => source.uri || source.title)
  const queries = grounding?.webSearchQueries ?? []
  const hasSearch = sources.length > 0 || queries.length > 0
  const executions = (codeExecutions ?? []).filter((execution) => execution.code || execution.output)
  const count = rows.length + (hasSearch ? 1 : 0) + executions.length
  if (!count) return null

  const summaryStyle = {
    cursor: 'pointer', px: 1.25, py: 1, fontSize: '0.76rem', fontWeight: 600,
    color: 'text.secondary', overflowWrap: 'anywhere', '&:hover': { bgcolor: 'action.hover' },
  } as const
  const detailStyle = { borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 0 } } as const

  return <Box sx={{ mb: 1, width: 'fit-content', maxWidth: 'min(100%, 640px)', minWidth: 'min(100%, 280px)', border: '1px dashed', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
    <ButtonBase onClick={() => setExpanded(!expanded)} aria-expanded={expanded}
      sx={{ width: '100%', px: 1.25, py: 0.85, display: 'flex', gap: 0.75, justifyContent: 'flex-start', textAlign: 'left', color: 'text.secondary', '&:hover': { bgcolor: 'action.hover' } }}>
      <AccountTreeRoundedIcon sx={{ fontSize: 16, flexShrink: 0 }} />
      <Typography variant="caption" sx={{ flex: 1, fontWeight: 650 }}>
        執行步驟 · {count} 項{running ? ` · ${steps.at(-1)?.label ?? '處理中'}` : ''}
      </Typography>
      <ExpandMoreRoundedIcon sx={{ fontSize: 17, transform: expanded ? 'rotate(180deg)' : undefined }} />
    </ButtonBase>
    <Collapse in={expanded}>
      <Box sx={{ maxHeight: { xs: 240, sm: 360 }, overflowY: 'auto', overscrollBehavior: 'contain', borderTop: '1px solid', borderColor: 'divider' }}>
        {rows.map(({ key, label, call, step, results }, index) => <Box component="details" key={key} sx={detailStyle}>
          <Box component="summary" sx={summaryStyle}>
            {index + 1}. {label}{call ? ' · 參數與結果' : ''}
            {results.some((result) => result.status === 'error') ? <Box component="span" sx={{ ml: 1, color: 'error.main' }}>錯誤</Box> : null}
          </Box>
          <Stack spacing={0.75} sx={{ p: 1.25, pt: 0 }}>
            {step.startedAt && step.finishedAt ? <Typography variant="caption" color="text.secondary">步驟耗時 {((step.finishedAt - step.startedAt) / 1000).toFixed(1)} 秒</Typography> : null}
            {call ? <>
              <Typography variant="caption" color="text.secondary">{call.name} · 參數</Typography>
              <Box component="pre" sx={outputStyle}>{JSON.stringify(call.args ?? {}, null, 2)}</Box>
            </> : <Typography variant="caption" color="text.secondary">{label}</Typography>}
            {results.map((result, resultIndex) => <Box key={resultIndex}>
              <Typography variant="caption" color={result.status === 'error' ? 'error' : 'text.secondary'}>
                {result.status === 'error' ? '工具回報錯誤' : '工具回傳結果'}
              </Typography>
              <Box component="pre" sx={outputStyle}>{result.content}</Box>
            </Box>)}
          </Stack>
        </Box>)}
        {hasSearch ? <Box component="details" sx={detailStyle}>
          <Box component="summary" sx={summaryStyle}>網路搜尋 · {sources.length} 個來源</Box>
          <Stack spacing={0.75} sx={{ p: 1.25, pt: 0 }}>
            {queries.length ? <Box component="pre" sx={outputStyle}>{queries.join('\n')}</Box> : null}
            {sources.map((source, index) => source.uri && /^https?:\/\//.test(source.uri)
              ? <Link key={index} href={source.uri} target="_blank" rel="noopener noreferrer" variant="caption">{source.title || source.uri}</Link>
              : <Typography key={index} variant="caption">{source.title || source.uri}</Typography>)}
          </Stack>
        </Box> : null}
        {executions.map((execution, index) => <Box component="details" key={`code-${index}`} sx={detailStyle}>
          <Box component="summary" sx={summaryStyle}>程式碼計算 {index + 1}{execution.language ? ` · ${execution.language}` : ''}</Box>
          <Stack spacing={0.75} sx={{ p: 1.25, pt: 0 }}>
            {execution.code ? <Box component="pre" sx={outputStyle}>{execution.code}</Box> : null}
            {execution.outcome ? <Typography variant="caption">{execution.outcome}</Typography> : null}
            {execution.output ? <Box component="pre" sx={outputStyle}>{execution.output}</Box> : null}
          </Stack>
        </Box>)}
      </Box>
    </Collapse>
  </Box>
}
