import { useState } from 'react'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { MobileShell } from '../../components/MobileShell'
import { supportedCurrencies } from '../../lib/currencies'
import type { Attraction, ExpenseDraft, Itinerary } from '../../types/database'
import { ExpenseItemsSection } from './ExpenseItemsSection'
import { ExpenseReceiptImagesSection } from './ExpenseReceiptImagesSection'

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
  const [entryMode, setEntryMode] = useState<ExpenseEntryMode>(() =>
    draft.receiptImagePaths.length > 0 || draft.imageFiles.length > 0
      ? 'receipt'
      : 'manual',
  )

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

  const receiptSection = (
    <ExpenseReceiptImagesSection
      draft={draft}
      storedImageUrls={storedImageUrls}
      isBusy={isBusy}
      isScanning={isScanning}
      onChange={onChange}
      onScan={onScan}
    />
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
                <MenuItem key={itinerary.id} value={itinerary.id}>{itinerary.title}</MenuItem>
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
                  <MenuItem key={currency} value={currency}>{currency}</MenuItem>
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
            onChange={(event) => updateDraft('amount', Number.parseFloat(event.target.value) || 0)}
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

        <ExpenseItemsSection draft={draft} isBusy={isBusy} onChange={onChange} />

        {entryMode === 'manual' ? receiptSection : null}
      </Stack>
    </MobileShell>
  )
}
