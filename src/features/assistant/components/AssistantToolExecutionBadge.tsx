import { useState } from 'react'
import CodeRoundedIcon from '@mui/icons-material/CodeRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded'
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
} from '../types'

export function AssistantToolExecutionBadge({
  grounding,
  codeExecutions,
}: {
  grounding?: AssistantGroundingMetadata | null
  codeExecutions?: AssistantCodeExecution[] | null
}) {
  const [expanded, setExpanded] = useState(false)

  const queries = grounding?.webSearchQueries ?? []
  const sources = (grounding?.sources ?? []).filter((s) => s.uri || s.title)
  const executions = (codeExecutions ?? []).filter((c) => c.code || c.output)

  const hasSearch = queries.length > 0 || sources.length > 0
  const hasCode = executions.length > 0

  if (!hasSearch && !hasCode) return null

  const getLabel = () => {
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
          color: '#0f766e',
          bgcolor: 'rgba(15, 118, 110, 0.08)',
          border: '1px solid rgba(15, 118, 110, 0.16)',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'all 0.18s ease-in-out',
          '&:hover': {
            bgcolor: 'rgba(15, 118, 110, 0.14)',
            borderColor: 'rgba(15, 118, 110, 0.28)',
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
            bgcolor: '#f8fafc',
            border: '1px solid rgba(15, 118, 110, 0.15)',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
            fontSize: '0.78rem',
            maxWidth: 480,
          }}
        >
          <Stack spacing={1.25}>
            {/* 搜尋關鍵字 */}
            {queries.length > 0 ? (
              <Box>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 0.5 }}>
                  <SearchRoundedIcon sx={{ fontSize: 13, color: '#0f766e' }} />
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
                        bgcolor: 'rgba(15, 118, 110, 0.08)',
                        color: '#0f766e',
                        border: '1px solid rgba(15, 118, 110, 0.18)',
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
                  {sources.map((source, index) => (
                    <Link
                      key={`${source.uri ?? source.title}-${index}`}
                      href={source.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        color: '#0d766e',
                        fontSize: '0.75rem',
                        textDecoration: 'none',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        '&:hover': {
                          textDecoration: 'underline',
                          color: '#0f766e',
                        },
                      }}
                    >
                      <OpenInNewRoundedIcon sx={{ fontSize: 12, flexShrink: 0, opacity: 0.8 }} />
                      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {source.title || source.uri}
                      </Box>
                    </Link>
                  ))}
                </Stack>
              </Box>
            ) : null}

            {/* Python 程式碼執行 */}
            {executions.length > 0 ? (
              <Box>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 0.5 }}>
                  <TerminalRoundedIcon sx={{ fontSize: 13, color: '#0f766e' }} />
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
                            bgcolor: '#0f172a',
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
                            bgcolor: '#e2e8f0',
                            color: '#1e293b',
                            fontFamily: 'ui-monospace, monospace',
                            fontSize: '0.7rem',
                            borderLeft: '3px solid #0d766e',
                          }}
                        >
                          <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: '#475569', fontSize: '0.66rem' }}>
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
