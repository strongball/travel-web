import { useEffect, useRef, useState } from 'react'
import AddPhotoAlternateRoundedIcon from '@mui/icons-material/AddPhotoAlternateRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import {
  Alert,
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
import type { Attraction, ExpenseDraft, Itinerary } from '../../types/database'
import type { ExpenseItem } from '../../types/receipt'
import { supportedCurrencies } from '../../lib/currencies'

const maxReceiptImages = 5
type ExpenseEntryMode = 'receipt' | 'manual'

export interface ExpenseEditorPageProps {
  draft: ExpenseDraft
  itineraries: readonly Itinerary[]
  attractions?: readonly Attraction[]
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
  attractions = [],
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
  const [entryMode, setEntryMode] = useState<ExpenseEntryMode>(() =>
    draft.receiptImagePaths.length > 0 || draft.imageFiles.length > 0
      ? 'receipt'
      : 'manual',
  )

  useEffect(() => {
    const urls = draft.imageFiles.map((file) => URL.createObjectURL(file))
    setFilePreviews(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [draft.imageFiles])

  const imageCount = draft.receiptImagePaths.length + draft.imageFiles.length
  const isBusy = isScanning || isSaving
  const selectedItinerary = itineraries.find((itinerary) => itinerary.id === draft.itineraryId)
  const currencyOptions = Array.from(new Set([
    draft.currency,
    ...(selectedItinerary ? Object.keys(selectedItinerary.exchangeRates ?? {}) : []),
    ...supportedCurrencies,
  ]))

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

  const updateItem = (index: number, changes: Partial<ExpenseItem>) => {
    updateDraft(
      'items',
      draft.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...changes } : item,
      ),
    )
  }

  const addItem = () => {
    updateDraft('items', [
      ...draft.items,
      {
        position: draft.items.length,
        sourceName: '',
        localizedName: '',
        quantity: 1,
        unitPrice: null,
        lineTotal: null,
      },
    ])
  }

  const removeItem = (index: number) => {
    updateDraft(
      'items',
      draft.items
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, position) => ({ ...item, position })),
    )
  }

  const receiptSection = (
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
  )

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

        <Stack component="section" spacing={1.25} aria-labelledby="entry-mode-title">
          <Box>
            <Typography id="entry-mode-title" variant="h6" sx={{ fontWeight: 700 }}>
              {t('editor.entryMode')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t(entryMode === 'receipt' ? 'editor.receiptModeHelp' : 'editor.manualModeHelp')}
            </Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button
              fullWidth
              variant={entryMode === 'receipt' ? 'contained' : 'outlined'}
              color={entryMode === 'receipt' ? 'primary' : 'inherit'}
              startIcon={<ReceiptLongRoundedIcon />}
              onClick={() => setEntryMode('receipt')}
              sx={{ justifyContent: 'flex-start', minHeight: 52, textAlign: 'left' }}
            >
              {t('editor.receiptMode')}
            </Button>
            <Button
              fullWidth
              variant={entryMode === 'manual' ? 'contained' : 'outlined'}
              color={entryMode === 'manual' ? 'primary' : 'inherit'}
              startIcon={<EditRoundedIcon />}
              onClick={() => setEntryMode('manual')}
              sx={{ justifyContent: 'flex-start', minHeight: 52, textAlign: 'left' }}
            >
              {t('editor.manualMode')}
            </Button>
          </Stack>
        </Stack>

        {entryMode === 'receipt' ? receiptSection : null}

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

          {attractions.length > 0 ? (
            <FormControl fullWidth>
              <InputLabel id="attraction-label">關聯景點</InputLabel>
              <Select
                labelId="attraction-label"
                label="關聯景點"
                value={draft.attractionId ?? ''}
                disabled={isBusy}
                onChange={(event) => updateDraft('attractionId', event.target.value || null)}
              >
                <MenuItem value="">一般費用</MenuItem>
                {attractions.map((attraction) => (
                  <MenuItem key={attraction.id} value={attraction.id}>{attraction.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : null}

          <TextField
            required
            fullWidth
            label={t('editor.title')}
            value={draft.title}
            disabled={isBusy}
            autoComplete="off"
            onChange={(event) => updateDraft('title', event.target.value)}
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
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
            <FormControl sx={{ minWidth: { sm: 112 }, width: { xs: '100%', sm: 'auto' } }}>
              <InputLabel id="currency-label">{t('editor.currency')}</InputLabel>
              <Select
                labelId="currency-label"
                label={t('editor.currency')}
                value={draft.currency}
                disabled={isBusy}
                onChange={(event) => updateDraft('currency', event.target.value)}
              >
                {currencyOptions.map((currency) => (
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

        <Stack component="section" spacing={1.5} aria-labelledby="expense-items-title">
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography id="expense-items-title" variant="h6" sx={{ fontWeight: 700 }}>
                {t('editor.items')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('editor.itemsHelp')}
              </Typography>
            </Box>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddRoundedIcon />}
              disabled={isBusy}
              onClick={addItem}
              sx={{ flexShrink: 0, borderRadius: 2.5 }}
            >
              {t('editor.addItem')}
            </Button>
          </Stack>

          {draft.items.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', borderStyle: 'dashed', borderRadius: 3 }}>
              <Typography color="text.secondary">{t('editor.noItems')}</Typography>
            </Paper>
          ) : draft.items.map((item, index) => {
            const itemName = item.localizedName || item.sourceName || t('editor.item', { count: index + 1 })
            const hasDifferentSource = Boolean(item.sourceName && item.localizedName && item.sourceName !== item.localizedName)
            return (
              <Accordion
                key={item.id ?? `item-${index}`}
                disableGutters
                elevation={0}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 3,
                  overflow: 'hidden',
                  '&:before': { display: 'none' },
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreRoundedIcon />}
                  sx={{ minHeight: 56, px: 1.5, '& .MuiAccordionSummary-content': { my: 1 } }}
                >
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0, width: '100%', pr: 0.5 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography noWrap sx={{ fontWeight: 700 }}>{itemName}</Typography>
                      {hasDifferentSource ? <Typography noWrap variant="caption" color="text.secondary">{item.sourceName}</Typography> : null}
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                      {item.quantity} × {item.lineTotal === null ? '—' : `${draft.currency} ${item.lineTotal.toLocaleString('zh-TW')}`}
                    </Typography>
                    <IconButton
                      size="small"
                      color="error"
                      disabled={isBusy}
                      aria-label={t('editor.removeItem', { count: index + 1 })}
                      onClick={(event) => { event.stopPropagation(); removeItem(index) }}
                      onFocus={(event) => event.stopPropagation()}
                    >
                      <DeleteOutlineRoundedIcon />
                    </IconButton>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 1.5, pt: 0.5 }}>
                  <Stack spacing={1.25}>
                    <TextField
                      fullWidth
                      label={t('review.localizedName')}
                      value={item.localizedName}
                      disabled={isBusy}
                      onChange={(event) => updateItem(index, { localizedName: event.target.value })}
                    />
                    <TextField
                      fullWidth
                      label={t('review.sourceName')}
                      value={item.sourceName}
                      disabled={isBusy}
                      onChange={(event) => updateItem(index, { sourceName: event.target.value })}
                    />
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                      <TextField
                        fullWidth
                        type="number"
                        label={t('review.quantity')}
                        value={item.quantity}
                        disabled={isBusy}
                        slotProps={{ htmlInput: { min: 0.001, step: '0.001', inputMode: 'decimal' } }}
                        onChange={(event) => updateItem(index, { quantity: Number.parseFloat(event.target.value) || 0 })}
                      />
                      <TextField
                        fullWidth
                        type="number"
                        label={t('review.unitPrice', { currency: draft.currency })}
                        value={item.unitPrice ?? ''}
                        disabled={isBusy}
                        slotProps={{ htmlInput: { min: 0, step: '0.01', inputMode: 'decimal' } }}
                        onChange={(event) => updateItem(index, { unitPrice: parseNullableNumber(event.target.value) })}
                      />
                      <TextField
                        fullWidth
                        type="number"
                        label={t('review.lineTotal', { currency: draft.currency })}
                        value={item.lineTotal ?? ''}
                        disabled={isBusy}
                        slotProps={{ htmlInput: { min: 0, step: '0.01', inputMode: 'decimal' } }}
                        onChange={(event) => updateItem(index, { lineTotal: parseNullableNumber(event.target.value) })}
                      />
                    </Stack>
                  </Stack>
                </AccordionDetails>
              </Accordion>
            )
          })}
        </Stack>

        {entryMode === 'manual' ? receiptSection : null}
      </Stack>
    </MobileShell>
  )
}

function parseNullableNumber(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
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
