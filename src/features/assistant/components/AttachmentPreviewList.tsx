import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded'
import ImageIcon from '@mui/icons-material/Image'
import {
  Avatar,
  Box,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import type { AssistantAttachment } from '../types'

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentPreviewList({
  attachments,
  onRemoveAttachment,
  disabled = false,
}: {
  attachments: AssistantAttachment[]
  onRemoveAttachment: (id: string) => void
  disabled?: boolean
}) {
  if (attachments.length === 0) return null

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        mb: 1,
        overflowX: 'auto',
        py: 0.5,
        px: 0.25,
        '&::-webkit-scrollbar': { height: 4 },
        '&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 2 },
      }}
    >
      {attachments.map((att) => {
        const isImage = att.mimeType.startsWith('image/')
        return (
          <Paper
            key={att.id}
            variant="outlined"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              p: 0.75,
              pr: 1,
              borderRadius: 2.5,
              bgcolor: 'background.paper',
              borderColor: 'surfaceSubtleBorder',
              boxShadow: (theme) => theme.palette.cardShadow,
              flexShrink: 0,
              maxWidth: 220,
            }}
          >
            {isImage && att.dataUrl ? (
              <Box
                component="img"
                src={att.dataUrl}
                alt={att.name}
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 1.5,
                  objectFit: 'cover',
                }}
              />
            ) : (
              <Avatar
                variant="rounded"
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 1.5,
                  bgcolor: 'surfaceSubtle',
                  color: 'primary.main',
                }}
              >
                {isImage ? <ImageIcon fontSize="small" /> : <DescriptionRoundedIcon fontSize="small" />}
              </Avatar>
            )}

            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                noWrap
                variant="body2"
                sx={{ fontSize: '0.78rem', fontWeight: 700 }}
              >
                {att.name}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: '0.68rem' }}
              >
                {formatSize(att.size)}
              </Typography>
            </Box>

            <IconButton
              size="small"
              onClick={() => onRemoveAttachment(att.id)}
              disabled={disabled}
              aria-label={`移除 ${att.name}`}
              sx={{
                width: 22,
                height: 22,
                p: 0,
                color: 'text.secondary',
                '&:hover': { color: 'error.main', bgcolor: 'error.lighter' },
              }}
            >
              <CloseRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Paper>
        )
      })}
    </Stack>
  )
}
