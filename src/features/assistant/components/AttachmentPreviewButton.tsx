import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import type { AssistantAttachment } from '../types'

export function AttachmentPreviewButton({ attachment, children, disabled = false }: {
  attachment: AssistantAttachment
  children?: ReactNode
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const image = attachment.mimeType.startsWith('image/')
  useEffect(() => {
    if (!open || image) return
    setError(null)
    try {
      const bytes = attachment.dataUrl
        ? Uint8Array.from(atob(attachment.dataUrl.slice(attachment.dataUrl.indexOf(',') + 1)), (character) => character.charCodeAt(0))
        : attachment.textContent ?? ''
      const url = URL.createObjectURL(new Blob([bytes], { type: attachment.mimeType === 'application/pdf' ? 'application/pdf' : 'application/octet-stream' }))
      setFileUrl(url)
      return () => { URL.revokeObjectURL(url); setFileUrl(null) }
    } catch {
      setError('無法開啟這份附件，請重新上傳。')
    }
  }, [open, image, attachment.dataUrl, attachment.textContent, attachment.mimeType])
  return <>
    <ButtonBase aria-label={`預覽 ${attachment.name}`} disabled={disabled} onClick={() => setOpen(true)} sx={{ textAlign: 'left', color: 'inherit', borderRadius: 1.5, minWidth: 0, maxWidth: '100%' }}>
      {children ?? attachment.name}
    </ButtonBase>
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
      <DialogTitle sx={{ overflowWrap: 'anywhere' }}>{attachment.name}</DialogTitle>
      <DialogContent>
        {error ? <Alert severity="error">{error}</Alert> : image && attachment.dataUrl ? (
          <Box component="img" src={attachment.dataUrl} alt={attachment.name} sx={{ width: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
        ) : attachment.textContent !== undefined ? (
          <Box component="pre" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', m: 0 }}>{attachment.textContent}</Box>
        ) : attachment.mimeType === 'application/pdf' && fileUrl ? (
          <Box component="iframe" src={fileUrl} title={attachment.name} sx={{ width: '100%', height: '65vh', border: 0 }} />
        ) : fileUrl ? <Alert severity="info">此格式無法預覽，可以下載附件查看。</Alert> : null}
      </DialogContent>
      <DialogActions>
        {(image ? attachment.dataUrl : fileUrl) ? <Button component="a" href={(image ? attachment.dataUrl : fileUrl) ?? undefined} download={attachment.name}>下載附件</Button> : null}
        <Button onClick={() => setOpen(false)}>關閉預覽</Button>
      </DialogActions>
    </Dialog>
  </>
}
