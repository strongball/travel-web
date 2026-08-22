import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material'

interface RenameCategoryDialogProps {
  open: boolean
  name: string
  error: string
  onNameChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}

export function RenameCategoryDialog({
  open,
  name,
  error,
  onNameChange,
  onClose,
  onSubmit,
}: RenameCategoryDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle sx={{ fontWeight: 900, fontSize: '1.15rem', pb: 1 }}>
        重新命名分類
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <TextField
          autoFocus
          label="新分類名稱"
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
          儲存變更
        </Button>
      </DialogActions>
    </Dialog>
  )
}
