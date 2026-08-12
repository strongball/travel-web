import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded'
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Divider, Stack, TextField, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { ExpenseItem } from '../../types/receipt'
import { formatReceiptAmount, parseNullableNumber, type EditableExpenseItem } from './receiptReviewUtils'

interface ReceiptItemCardProps {
  item: EditableExpenseItem
  index: number
  count: number
  currency: string
  onChange: (changes: Partial<ExpenseItem>) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

export function ReceiptItemCard({ item, index, count, currency, onChange, onDelete, onMoveUp, onMoveDown }: ReceiptItemCardProps) {
  const { t } = useTranslation()
  const label = t('review.item', { count: index + 1 })
  const itemName = item.localizedName || item.sourceName || label
  return (
    <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, overflow: 'hidden', '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ minHeight: 56, px: 1.5, '& .MuiAccordionSummary-content': { my: 1 } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0, width: '100%', pr: 0.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}><Typography noWrap sx={{ fontWeight: 700 }}>{itemName}</Typography></Box>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{formatReceiptAmount(item.lineTotal, currency)}</Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 1.5, pt: 0.5 }}>
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end', flexWrap: 'wrap', rowGap: 0.5 }}>
            <Button size="small" aria-label={t('review.moveUp', { label })} disabled={index === 0} onClick={onMoveUp} startIcon={<ArrowUpwardRoundedIcon />} sx={{ minHeight: 44 }}>{t('review.moveUp', { label })}</Button>
            <Button size="small" aria-label={t('review.moveDown', { label })} disabled={index === count - 1} onClick={onMoveDown} startIcon={<ArrowDownwardRoundedIcon />} sx={{ minHeight: 44 }}>{t('review.moveDown', { label })}</Button>
            <Button size="small" aria-label={t('review.delete', { label })} color="error" onClick={onDelete} startIcon={<DeleteOutlineRoundedIcon />} sx={{ minHeight: 44 }}>{t('review.delete', { label })}</Button>
          </Stack>
          <Divider />
          <TextField fullWidth required label={t('review.sourceName')} value={item.sourceName} onChange={(event) => onChange({ sourceName: event.target.value })} />
          <TextField fullWidth label={t('review.localizedName')} value={item.localizedName} onChange={(event) => onChange({ localizedName: event.target.value })} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField fullWidth type="number" label={t('review.quantity')} value={item.quantity} slotProps={{ htmlInput: { min: 0.001, step: '0.001', inputMode: 'decimal' } }} onChange={(event) => onChange({ quantity: Number.parseFloat(event.target.value) || 0 })} />
            <TextField fullWidth type="number" label={t('review.unitPrice', { currency })} value={item.unitPrice ?? ''} slotProps={{ htmlInput: { min: 0, step: '0.01', inputMode: 'decimal' } }} onChange={(event) => onChange({ unitPrice: parseNullableNumber(event.target.value) })} />
          </Stack>
          <TextField fullWidth type="number" label={t('review.lineTotal', { currency })} value={item.lineTotal ?? ''} slotProps={{ htmlInput: { min: 0, step: '0.01', inputMode: 'decimal' } }} onChange={(event) => onChange({ lineTotal: parseNullableNumber(event.target.value) })} />
        </Stack>
      </AccordionDetails>
    </Accordion>
  )
}
