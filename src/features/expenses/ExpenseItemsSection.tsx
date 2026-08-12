import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { ExpenseDraft } from '../../types/database'
import type { ExpenseItem } from '../../types/receipt'

interface ExpenseItemsSectionProps {
  draft: ExpenseDraft
  isBusy: boolean
  onChange: (draft: ExpenseDraft) => void
}

export function ExpenseItemsSection({ draft, isBusy, onChange }: ExpenseItemsSectionProps) {
  const { t } = useTranslation()
  const updateItems = (items: ExpenseItem[]) => onChange({ ...draft, items })

  const updateItem = (index: number, changes: Partial<ExpenseItem>) => {
    updateItems(draft.items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...changes } : item,
    ))
  }

  const addItem = () => {
    updateItems([
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
    updateItems(
      draft.items
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, position) => ({ ...item, position })),
    )
  }

  return (
    <Stack component="section" spacing={1.5} aria-labelledby="expense-items-title">
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography id="expense-items-title" variant="h6" sx={{ fontWeight: 700 }}>
            {t('editor.items')}
          </Typography>
          <Typography variant="body2" color="text.secondary">{t('editor.itemsHelp')}</Typography>
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
        const hasDifferentSource = Boolean(
          item.sourceName && item.localizedName && item.sourceName !== item.localizedName,
        )
        return (
          <Accordion
            key={item.id ?? `item-${index}`}
            disableGutters
            elevation={0}
            sx={{ border: 1, borderColor: 'divider', borderRadius: 3, overflow: 'hidden', '&:before': { display: 'none' } }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreRoundedIcon />}
              sx={{
                minHeight: 64,
                px: { xs: 1, sm: 1.5 },
                gap: 0.25,
                '& .MuiAccordionSummary-content': {
                  minWidth: 0,
                  my: 1,
                  overflow: 'hidden',
                },
                '& .MuiAccordionSummary-expandIconWrapper': {
                  flexShrink: 0,
                  ml: 0.25,
                },
              }}
            >
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto auto',
                  alignItems: 'center',
                  columnGap: { xs: 0.5, sm: 1 },
                  minWidth: 0,
                  width: '100%',
                }}
              >
                <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
                  <Typography noWrap sx={{ fontWeight: 700 }}>{itemName}</Typography>
                  {hasDifferentSource ? (
                    <Typography noWrap variant="caption" color="text.secondary">{item.sourceName}</Typography>
                  ) : null}
                </Box>
                <Typography
                  noWrap
                  variant="body2"
                  color="text.secondary"
                  sx={{ maxWidth: { xs: 132, sm: 'none' }, minWidth: 0 }}
                >
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
              </Box>
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
  )
}

function parseNullableNumber(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}
