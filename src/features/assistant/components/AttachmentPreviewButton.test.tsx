import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AttachmentPreviewButton } from './AttachmentPreviewButton'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('attachment previews', () => {
  it('opens an image at full size and closes it without sending anything', () => {
    render(<AttachmentPreviewButton attachment={{ id: 'image', name: 'map.png', mimeType: 'image/png', size: 3, dataUrl: 'data:image/png;base64,YWJj' }} />)
    fireEvent.click(screen.getByRole('button', { name: '預覽 map.png' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'map.png' })).toHaveAttribute('src', 'data:image/png;base64,YWJj')
    expect(screen.getByRole('link', { name: '下載附件' })).toHaveAttribute('download', 'map.png')
    fireEvent.click(screen.getByRole('button', { name: '關閉預覽' }))
  })

  it('uses a local PDF URL and releases it after closing the preview', async () => {
    const create = vi.fn(() => 'blob:pdf-preview')
    const revoke = vi.fn()
    const NativeURL = URL
    vi.stubGlobal('URL', class extends NativeURL { static createObjectURL = create; static revokeObjectURL = revoke })
    const { unmount } = render(<AttachmentPreviewButton attachment={{ id: 'pdf', name: 'booking.pdf', mimeType: 'application/pdf', size: 3, dataUrl: 'data:application/pdf;base64,YWJj' }} />)
    fireEvent.click(screen.getByRole('button', { name: '預覽 booking.pdf' }))
    await waitFor(() => expect(screen.getByTitle('booking.pdf')).toHaveAttribute('src', 'blob:pdf-preview'))
    expect(create).toHaveBeenCalledWith(expect.any(Blob))
    unmount()
    expect(revoke).toHaveBeenCalledWith('blob:pdf-preview')
  })
})
