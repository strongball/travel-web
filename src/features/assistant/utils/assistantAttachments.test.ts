import { describe, expect, it, vi } from 'vitest'
import { readAssistantAttachments } from './assistantAttachments'

describe('assistantAttachments', () => {
  it('reads text files correctly', async () => {
    const file = new File(['hello world'], 'notes.txt', { type: 'text/plain' })
    const result = await readAssistantAttachments([file])

    expect(result.errors).toHaveLength(0)
    expect(result.attachments).toHaveLength(1)
    expect(result.attachments[0]).toMatchObject({
      name: 'notes.txt',
      mimeType: 'text/plain',
      textContent: 'hello world',
    })
  })

  it('rejects files larger than 10MB', async () => {
    const largeFile = new File(['a'], 'huge.dat', { type: 'application/octet-stream' })
    Object.defineProperty(largeFile, 'size', { value: 11 * 1024 * 1024 })

    const result = await readAssistantAttachments([largeFile])
    expect(result.attachments).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('超過 10MB 大小限制')
  })

  it('reads and compresses image files gracefully', async () => {
    class MockImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      width = 2000
      height = 1000
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }

    const originalImage = globalThis.Image
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL

    try {
      globalThis.Image = MockImage as unknown as typeof Image
      URL.createObjectURL = vi.fn(() => 'blob:fake-url')
      URL.revokeObjectURL = vi.fn()
      HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
        drawImage: vi.fn(),
      })) as unknown as typeof HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/jpeg;base64,mockedcompresseddata')

      const file = new File(['fake-binary-content'], 'test.png', { type: 'image/png' })
      const result = await readAssistantAttachments([file])

      expect(result.errors).toHaveLength(0)
      expect(result.attachments).toHaveLength(1)
      expect(result.attachments[0]?.dataUrl).toBe('data:image/jpeg;base64,mockedcompresseddata')
      expect(result.attachments[0]?.mimeType).toBe('image/png')
    } finally {
      globalThis.Image = originalImage
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
      HTMLCanvasElement.prototype.getContext = originalGetContext
      HTMLCanvasElement.prototype.toDataURL = originalToDataURL
    }
  })
})
