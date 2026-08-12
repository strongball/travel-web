import { describe, expect, it } from 'vitest'

import {
  canonicalizeImageReference,
  storageObjectPath,
} from './imageReference'

describe('imageReference', () => {
  it('canonicalizes legacy public and signed URLs', () => {
    expect(
      canonicalizeImageReference(
        'https://project.supabase.co/storage/v1/object/public/travel_images/user/a.jpg',
      ),
    ).toBe('storage://travel_images/user/a.jpg')
    expect(
      canonicalizeImageReference(
        'https://project.supabase.co/storage/v1/object/sign/travel_images/user/a.jpg?token=secret',
      ),
    ).toBe('storage://travel_images/user/a.jpg')
  })

  it('does not treat arbitrary URLs as storage references', () => {
    expect(storageObjectPath('https://example.com/a.jpg')).toBeNull()
  })
})
