import { useState } from 'react'
import BuildRoundedIcon from '@mui/icons-material/BuildRounded'
import CategoryRoundedIcon from '@mui/icons-material/CategoryRounded'
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded'
import CodeRoundedIcon from '@mui/icons-material/CodeRounded'
import EditCalendarRoundedIcon from '@mui/icons-material/EditCalendarRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded'
import MapRoundedIcon from '@mui/icons-material/MapRounded'
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded'
import PlaylistAddCheckRoundedIcon from '@mui/icons-material/PlaylistAddCheckRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded'
import {
  Box,
  ButtonBase,
  Chip,
  Collapse,
  Link,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import type {
  AssistantCodeExecution,
  AssistantGroundingMetadata,
  AssistantToolCallRecord,
} from '../types'

function getToolIcon(name: string) {
  switch (name) {
    case 'view_itinerary':
      return <MapRoundedIcon sx={{ fontSize: 14, color: 'primary.main' }} />
    case 'view_todo_categories':
      return <CategoryRoundedIcon sx={{ fontSize: 14, color: 'primary.main' }} />
    case 'view_todo_list':
      return <ChecklistRoundedIcon sx={{ fontSize: 14, color: 'primary.main' }} />
    case 'search_web_information':
      return <SearchRoundedIcon sx={{ fontSize: 14, color: 'primary.main' }} />
    case 'propose_itinerary_edit':
      return <EditCalendarRoundedIcon sx={{ fontSize: 14, color: 'primary.main' }} />
    case 'propose_todo_list':
      return <PlaylistAddCheckRoundedIcon sx={{ fontSize: 14, color: 'primary.main' }} />
    case 'ask_clarifying_question':
      return <HelpOutlineRoundedIcon sx={{ fontSize: 14, color: 'primary.main' }} />
    default:
      return <BuildRoundedIcon sx={{ fontSize: 14, color: 'primary.main' }} />
  }
}

function formatToolArgs(args?: Record<string, unknown>): string | null {
  if (!args || Object.keys(args).length === 0) return null
  return Object.entries(args)
    .map(([key, val]) => {
      if (typeof val === 'string') {
        const preview = val.length > 40 ? `${val.slice(0, 40)}…` : val
        return `${key}: "${preview}"`
      }
      if (typeof val === 'number' || typeof val === 'boolean') {
        return `${key}: ${val}`
      }
      if (Array.isArray(val)) {
        return `${key}: [${val.length} 項]`
      }
      return `${key}: {…}`
    })
    .join(', ')
}

function isSafeHttpUrl(url?: string): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function AssistantToolExecutionBadge({
  grounding,
  codeExecutions,
  toolCalls,
}: {
  grounding?: AssistantGroundingMetadata | null
  codeExecutions?: AssistantCodeExecution[] | null
  toolCalls?: AssistantToolCallRecord[] | null
}) {
  const [expanded, setExpanded] = useState(false)

  const queries = grounding?.webSearchQueries ?? []
  const sources = (grounding?.sources ?? []).filter((s) => s.uri || s.title)
  const executions = (codeExecutions ?? []).filter((c) => c.code || c.output)
  const calls = toolCalls ?? []

  const hasSearch = queries.length > 0 || sources.length > 0
  const hasCode = executions.length > 0
  const hasTools = calls.length > 0

  if (!hasSearch && !hasCode && !hasTools) return null

  const getLabel = () => {
    if (hasTools) {
      const toolText = calls.length === 1
        ? `🛠️ 呼叫了工具：${calls[0].label}`
        : `🛠️ 呼叫了 ${calls.length} 個工具`
      if (sources.length > 0) return `${toolText} · 參考了 ${sources.length} 個來源`
      if (hasCode) return `${toolText} · 執行了計算`
      return toolText
    }
    if (sources.length > 0 && hasCode) {
      return `⚡ 參考了 ${sources.length} 個來源 · 執行了計算`
    }
    if (sources.length > 0) {
      return `🔍 參考了 ${sources.length} 個來源`
    }
    if (queries.length > 0 && hasCode) {
      return `⚡ 搜尋資訊 · 執行了計算`
    }
    if (queries.length > 0) {
      return `🔍 已搜尋相關資訊`
    }
    return `🐍 執行了程式碼計算`
  }

  return (
    <Box sx={{ mb: 0.65, display: 'inline-block', maxWidth: '100%' }}>
      <ButtonBase
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-label="查看工具調用細節"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1.1,
          py: 0.35,
          borderRadius: '12px',
          fontSize: '0.74rem',
          fontWeight: 500,
          color: 'primary.main',
          bgcolor: 'surfaceSubtle',
          border: '1px solid',
          borderColor: 'surfaceSubtleBorder',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'all 0.18s ease-in-out',
          '&:hover': {
            bgcolor: 'surfaceSubtleHover',
            borderColor: 'primary.main',
          },
        }}
      >
        <Typography
          component="span"
          sx={{
            fontSize: '0.74rem',
            fontWeight: 500,
            lineHeight: 1.2,
          }}
        >
          {getLabel()}
        </Typography>
        <ExpandMoreRoundedIcon
          sx={{
            fontSize: 15,
            transition: 'transform 0.2s ease',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </ButtonBase>

      <Collapse in={expanded} timeout={220} unmountOnExit>
        <Paper
          elevation={0}
          sx={{
            mt: 0.75,
            p: 1.25,
            borderRadius: '10px',
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: (theme) => theme.palette.cardShadow,
            fontSize: '0.78rem',
            maxWidth: 480,
          }}
        >
          <Stack spacing={1.25}>
            {/* 調用工具 */}
            {calls.length > 0 ? (
              <Box>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 0.5 }}>
                  <BuildRoundedIcon sx={{ fontSize: 13, color: 'primary.main' }} />
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.72rem' }}>
                    調用工具 ({calls.length})
                  </Typography>
                </Stack>
                <Stack spacing={0.5}>
                  {calls.map((call, idx) => {
                    const argsStr = formatToolArgs(call.args)
                    return (
                      <Box
                        key={call.id ?? `${call.name}-${idx}`}
                        sx={{
                          p: 0.75,
                          borderRadius: '6px',
                          bgcolor: 'action.hover',
                          border: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                          {getToolIcon(call.name)}
                          <Typography
                            sx={{
                              fontSize: '0.74rem',
                              fontWeight: 600,
                              color: 'primary.main',
                              lineHeight: 1.3,
                            }}
                          >
                            {call.label}
                          </Typography>
                          <Typography
                            component="span"
                            sx={{
                              fontSize: '0.68rem',
                              color: 'text.disabled',
                              fontFamily: 'ui-monospace, monospace',
                            }}
                          >
                            {call.name}
                          </Typography>
                        </Stack>
                        {argsStr ? (
                          <Typography
                            sx={{
                              mt: 0.25,
                              pl: 2.5,
                              fontSize: '0.68rem',
                              color: 'text.secondary',
                              fontFamily: 'ui-monospace, monospace',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {argsStr}
                          </Typography>
                        ) : null}
                      </Box>
                    )
                  })}
                </Stack>
              </Box>
            ) : null}

            {/* 搜尋關鍵字 */}
            {queries.length > 0 ? (
              <Box>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 0.5 }}>
                  <SearchRoundedIcon sx={{ fontSize: 13, color: 'primary.main' }} />
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.72rem' }}>
                    搜尋關鍵字
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                  {queries.map((q) => (
                    <Chip
                      key={q}
                      label={q}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.7rem',
                        bgcolor: 'surfaceSubtle',
                        color: 'primary.main',
                        border: '1px solid',
                        borderColor: 'surfaceSubtleBorder',
                      }}
                    />
                  ))}
                </Stack>
              </Box>
            ) : null}

            {/* 參考網頁來源 */}
            {sources.length > 0 ? (
              <Box>
                <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5, fontSize: '0.72rem' }}>
                  參考來源
                </Typography>
                <Stack spacing={0.5}>
                  {sources.map((source, index) => {
                    const isSafe = isSafeHttpUrl(source.uri)
                    const titleText = source.title || source.uri || '未知來源'
                    if (!isSafe) {
                      return (
                        <Typography
                          key={`${source.uri ?? source.title}-${index}`}
                          variant="caption"
                          sx={{
                            color: 'text.secondary',
                            fontSize: '0.75rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          • {titleText}
                        </Typography>
                      )
                    }
                    return (
                      <Link
                        key={`${source.uri ?? source.title}-${index}`}
                        href={source.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          color: 'primary.main',
                          fontSize: '0.75rem',
                          textDecoration: 'none',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          '&:hover': {
                            textDecoration: 'underline',
                            color: 'primary.dark',
                          },
                        }}
                      >
                        <OpenInNewRoundedIcon sx={{ fontSize: 12, flexShrink: 0, opacity: 0.8 }} />
                        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {titleText}
                        </Box>
                      </Link>
                    )
                  })}
                </Stack>
              </Box>
            ) : null}

            {/* Python 程式碼執行 */}
            {executions.length > 0 ? (
              <Box>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 0.5 }}>
                  <TerminalRoundedIcon sx={{ fontSize: 13, color: 'primary.main' }} />
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.72rem' }}>
                    Python 沙盒運算
                  </Typography>
                </Stack>
                <Stack spacing={0.75}>
                  {executions.map((exec, idx) => (
                    <Box key={idx} sx={{ borderRadius: '6px', overflow: 'hidden' }}>
                      {exec.code ? (
                        <Box
                          component="pre"
                          sx={{
                            m: 0,
                            p: 1,
                            bgcolor: 'codeBackground',
                            color: '#e2e8f0',
                            fontFamily: 'ui-monospace, monospace',
                            fontSize: '0.72rem',
                            overflowX: 'auto',
                            display: 'flex',
                            gap: 0.5,
                            alignItems: 'flex-start',
                          }}
                        >
                          <CodeRoundedIcon sx={{ fontSize: 12, color: '#38bdf8', mt: 0.25, flexShrink: 0 }} />
                          <code>{exec.code}</code>
                        </Box>
                      ) : null}
                      {exec.output ? (
                        <Box
                          sx={{
                            p: 0.75,
                            bgcolor: 'codeOutputBackground',
                            color: 'text.primary',
                            fontFamily: 'ui-monospace, monospace',
                            fontSize: '0.7rem',
                            borderLeft: '3px solid',
                            borderLeftColor: 'primary.main',
                          }}
                        >
                          <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', fontSize: '0.66rem' }}>
                            輸出結果：
                          </Typography>
                          <Box component="span" sx={{ whiteSpace: 'pre-wrap' }}>
                            {exec.output.trim()}
                          </Box>
                        </Box>
                      ) : null}
                    </Box>
                  ))}
                </Stack>
              </Box>
            ) : null}
          </Stack>
        </Paper>
      </Collapse>
    </Box>
  )
}
