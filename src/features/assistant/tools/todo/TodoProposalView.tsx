import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded'
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded'
import { Box, Chip, Stack, Typography } from '@mui/material'

export function TodoProposalView({
  proposedTodos,
}: {
  proposedTodos: Array<{ title: string; category: string }>
}) {
  if (proposedTodos.length === 0) return null

  const groupedProposedTodos = proposedTodos.reduce<Record<string, string[]>>((result, item) => {
    const cat = item.category || '行前準備'
    result[cat] = [...(result[cat] ?? []), item.title]
    return result
  }, {})

  return (
    <Box
      sx={{
        p: 1.5,
        bgcolor: '#f8faf9',
        borderRadius: 2.5,
        border: '1px solid rgba(13, 118, 110, 0.12)',
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.25 }}>
        <TaskAltRoundedIcon fontSize="small" sx={{ color: '#0d766e' }} />
        <Typography sx={{ fontWeight: 850, fontSize: '0.9rem', color: '#0d766e' }}>
          建議新增待辦項目
        </Typography>
        <Chip
          size="small"
          label={`共 ${proposedTodos.length} 項`}
          sx={{
            height: 20,
            fontSize: '0.72rem',
            fontWeight: 700,
            bgcolor: 'rgba(13, 118, 110, 0.1)',
            color: '#0d766e',
          }}
        />
      </Stack>
      <Stack spacing={1}>
        {Object.entries(groupedProposedTodos).map(([group, titles]) => (
          <Box
            key={group}
            sx={{
              p: 1.2,
              borderRadius: 2,
              bgcolor: '#ffffff',
              border: '1px solid rgba(13, 118, 110, 0.08)',
            }}
          >
            <Chip
              size="small"
              label={group}
              sx={{
                height: 20,
                fontSize: '0.72rem',
                fontWeight: 800,
                bgcolor: 'rgba(13, 118, 110, 0.08)',
                color: '#0d766e',
                mb: 0.75,
              }}
            />
            <Stack spacing={0.5}>
              {titles.map((todoTitle, index) => (
                <Stack
                  key={index}
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center', px: 0.5 }}
                >
                  <CheckCircleOutlineRoundedIcon
                    sx={{ fontSize: 16, color: '#0d766e', opacity: 0.7 }}
                  />
                  <Typography
                    variant="body2"
                    sx={{ fontSize: '0.86rem', color: 'text.primary', fontWeight: 500 }}
                  >
                    {todoTitle}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  )
}
