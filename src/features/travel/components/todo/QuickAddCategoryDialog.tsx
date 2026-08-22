import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material'

interface QuickAddCategoryDialogProps {
  open: boolean
  name: string
  error: string
  onNameChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}

export function QuickAddCategoryDialog({
  open,
  name,
  error,
  onNameChange,
  onClose,
  onSubmit,
}: QuickAddCategoryDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle sx={{ fontWeight: 900, fontSize: '1.15rem', pb: 1 }}>
        新增自訂分類
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <TextField
          autoFocus
          label="分類名稱"
          placeholder="例如：行李打包、票券門票…"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onSubmit()
            }
          }}
          error={Boolean(error)}
          helperText={error}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">
          取消
        </Button>
        <Button
          variant="contained"
          disabled={!name.trim()}
          onClick={onSubmit}
          sx={{ borderRadius: 2, px: 3 }}
        >
          建立並選取
        </Button>
      </DialogActions>
    </Dialog>
  )
}
