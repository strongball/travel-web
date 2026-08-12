import { useEffect, useRef, useState } from 'react'
import AddPhotoAlternateRoundedIcon from '@mui/icons-material/AddPhotoAlternateRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { MobileShell } from '../../components/MobileShell'
import type { ExpenseDraft, Itinerary } from '../../types/database'

const maxReceiptImages = 5

const currencies = ['TWD', 'JPY', 'USD', 'EUR', 'KRW', 'CNY', 'HKD']

export interface ExpenseEditorPageProps {
  draft: ExpenseDraft
  itineraries: readonly Itinerary[]
  onChange: (draft: ExpenseDraft) => void
  onScan: () => void | Promise<void>
  onSave: () => void | Promise<void>
  onCancel: () => void
  storedImageUrls?: readonly string[]
  isScanning?: boolean
  isSaving?: boolean
  error?: string | null
}

export function ExpenseEditorPage({
  draft,
  itineraries,
  onChange,
  onScan,
  onSave,
  onCancel,
  storedImageUrls = [],
  isScanning = false,
  isSaving = false,
  error,
}: ExpenseEditorPageProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [filePreviews, setFilePreviews] = useState<string[]>([])
  const [imageError, setImageError] = useState<string | null>(null)

  useEffect(() => {
    const urls = draft.imageFiles.map((file) => URL.createObjectURL(file))
    setFilePreviews(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [draft.imageFiles])

  const imageCount = draft.receiptImagePaths.length + draft.imageFiles.length
  const isBusy = isScanning || isSaving

  const updateDraft = <Key extends keyof ExpenseDraft>(
    key: Key,
    value: ExpenseDraft[Key],
  ) => onChange({ ...draft, [key]: value })

  const handleFiles = (files: FileList | null) => {
    if (!files) return

    const remaining = maxReceiptImages - imageCount
    const selected = Array.from(files).filter((file) =>
      file.type.startsWith('image/'),
    )

    if (remaining <= 0) {
      setImageError(t('editor.imageLimit', { count: maxReceiptImages }))
      return
    }

    const accepted = selected.slice(0, remaining)
    setImageError(
      selected.length > remaining
        ? t('editor.imageAdded', {
            accepted: accepted.length,
            count: maxReceiptImages,
          })
        : null,
    )
    updateDraft('imageFiles', [...draft.imageFiles, ...accepted])

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeStoredImage = (index: number) => {
    updateDraft(
      'receiptImagePaths',
      draft.receiptImagePaths.filter((_, imageIndex) => imageIndex !== index),
    )
  }

  const removeFile = (index: number) => {
    updateDraft(
      'imageFiles',
      draft.imageFiles.filter((_, imageIndex) => imageIndex !== index),
    )
  }

  return (
    <MobileShell
      title={draft.id ? t('editor.editTitle') : t('editor.addTitle')}
      onBack={onCancel}
      footer={
        <Button
          fullWidth
          size="large"
          variant="contained"
          disabled={isBusy || !draft.itineraryId || !draft.title.trim()}
          onClick={() => void onSave()}
          sx={{ minHeight: 48, borderRadius: 3, fontWeight: 700 }}
        >
          {isSaving ? <CircularProgress size={24} color="inherit" /> : t('editor.save')}
        </Button>
      }
    >
      <Stack spacing={2.5} sx={{ p: 2, pb: 4 }}>
        {error ? <Alert severity="error">{error}</Alert> : null}

        <Stack component="section" spacing={2} aria-labelledby="expense-details-title">
          <Typography id="expense-details-title" variant="h6" sx={{ fontWeight: 700 }}>
            {t('editor.details')}
          </Typography>

          <FormControl fullWidth required>
            <InputLabel id="itinerary-label">{t('editor.itinerary')}</InputLabel>
            <Select
              labelId="itinerary-label"
              label={t('editor.itinerary')}
              value={draft.itineraryId}
              disabled={isBusy}
              onChange={(event) => updateDraft('itineraryId', event.target.value)}
              sx={{ minHeight: 56 }}
            >
              {itineraries.map((itinerary) => (
                <MenuItem key={itinerary.id} value={itinerary.id}>
                  {itinerary.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            required
            fullWidth
            label={t('editor.title')}
            value={draft.title}
            disabled={isBusy}
            autoComplete="off"
            onChange={(event) => updateDraft('title', event.target.value)}
          />

          <Stack direction="row" spacing={1.5}>
            <TextField
              fullWidth
              required
              type="date"
              label={t('editor.date')}
              value={draft.date}
              disabled={isBusy}
              slotProps={{ inputLabel: { shrink: true } }}
              onChange={(event) => updateDraft('date', event.target.value)}
            />
            <FormControl sx={{ minWidth: 112 }}>
              <InputLabel id="currency-label">{t('editor.currency')}</InputLabel>
              <Select
                labelId="currency-label"
                label={t('editor.currency')}
                value={draft.currency}
                disabled={isBusy}
                onChange={(event) => updateDraft('currency', event.target.value)}
              >
                {currencies.map((currency) => (
                  <MenuItem key={currency} value={currency}>
                    {currency}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <TextField
            fullWidth
            required
            type="number"
            label={t('editor.amount')}
            value={draft.amount}
            disabled={isBusy}
            slotProps={{ htmlInput: { min: 0, step: '0.01', inputMode: 'decimal' } }}
            onChange={(event) =>
              updateDraft('amount', Number.parseFloat(event.target.value) || 0)
            }
          />

          <TextField
            fullWidth
            multiline
            minRows={2}
            label={t('editor.note')}
            value={draft.note}
            disabled={isBusy}
            onChange={(event) => updateDraft('note', event.target.value)}
          />
        </Stack>

        <Stack component="section" spacing={1.5} aria-labelledby="receipt-images-title">
          <Box>
            <Typography id="receipt-images-title" variant="h6" sx={{ fontWeight: 700 }}>
              {t('editor.images')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('editor.imageHelp', { count: maxReceiptImages })}
            </Typography>
          </Box>

          {imageError ? (
            <Alert severity="warning" onClose={() => setImageError(null)}>
              {imageError}
            </Alert>
          ) : null}

          {imageCount > 0 ? (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 1,
              }}
            >
              {draft.receiptImagePaths.map((path, index) => (
                <ImageTile
                  key={path}
                  src={storedImageUrls[index]}
                  label={t('editor.storedImage', { count: index + 1 })}
                  onRemove={() => removeStoredImage(index)}
                  disabled={isBusy}
                />
              ))}
              {draft.imageFiles.map((file, index) => (
                <ImageTile
                  key={`${file.name}-${file.lastModified}-${index}`}
                  src={filePreviews[index]}
                  label={file.name}
                  onRemove={() => removeFile(index)}
                  disabled={isBusy}
                />
              ))}
            </Box>
          ) : (
            <Paper
              variant="outlined"
              sx={{ p: 2.5, textAlign: 'center', borderStyle: 'dashed', borderRadius: 3 }}
            >
              <AddPhotoAlternateRoundedIcon color="action" sx={{ fontSize: 36 }} />
              <Typography color="text.secondary">{t('editor.noImages')}</Typography>
            </Paper>
          )}

          <Button
            component="label"
            variant="outlined"
            startIcon={<AddPhotoAlternateRoundedIcon />}
            disabled={isBusy || imageCount >= maxReceiptImages}
            sx={{ minHeight: 48, borderRadius: 3 }}
          >
            {t('editor.chooseImages')}
            <input
              ref={fileInputRef}
              hidden
              multiple
              type="file"
              accept="image/*"
              onChange={(event) => handleFiles(event.target.files)}
            />
          </Button>

          <Button
            variant="contained"
            color="secondary"
            startIcon={
              isScanning ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                <AutoAwesomeRoundedIcon />
              )
            }
            disabled={isBusy || imageCount === 0}
            onClick={() => void onScan()}
            sx={{ minHeight: 52, borderRadius: 3, fontWeight: 700 }}
          >
            {isScanning ? t('editor.scanning') : t('editor.scan')}
          </Button>
        </Stack>
      </Stack>
    </MobileShell>
  )
}

interface ImageTileProps {
  src?: string
  label: string
  disabled: boolean
  onRemove: () => void
}

function ImageTile({ src, label, disabled, onRemove }: ImageTileProps) {
  const { t } = useTranslation()

  return (
    <Box
      sx={{
        position: 'relative',
        aspectRatio: '1 / 1',
        overflow: 'hidden',
        borderRadius: 2,
        bgcolor: 'grey.100',
        border: 1,
        borderColor: 'divider',
      }}
    >
      {src ? (
        <Box
          component="img"
          src={src}
          alt={label}
          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <Stack sx={{ height: '100%', p: 1, alignItems: 'center', justifyContent: 'center' }}>
          <AddPhotoAlternateRoundedIcon color="disabled" />
          <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: '100%' }}>
            {label}
          </Typography>
        </Stack>
      )}
      <IconButton
        aria-label={t('editor.removeImage', { label })}
        size="small"
        disabled={disabled}
        onClick={onRemove}
        sx={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 36,
          height: 36,
          bgcolor: 'rgba(0, 0, 0, 0.66)',
          color: 'common.white',
          '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.78)' },
        }}
      >
        <CloseRoundedIcon fontSize="small" />
      </IconButton>
    </Box>
  )
}
