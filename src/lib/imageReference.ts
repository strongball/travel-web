export const imageBucket = 'travel_images'
const storagePrefix = `storage://${imageBucket}/`

export const storageReference = (objectPath: string) =>
  `${storagePrefix}${objectPath}`

export const storageObjectPath = (reference: string): string | null => {
  if (reference.startsWith(storagePrefix)) {
    return reference.slice(storagePrefix.length) || null
  }

  if (!reference.startsWith('http')) return null
  try {
    const url = new URL(reference)
    const segments = url.pathname.split('/').filter(Boolean)
    const bucketIndex = segments.indexOf(imageBucket)
    return bucketIndex >= 0 && bucketIndex + 1 < segments.length
      ? segments.slice(bucketIndex + 1).join('/')
      : null
  } catch {
    return null
  }
}

export const canonicalizeImageReference = (reference: string) => {
  const path = storageObjectPath(reference)
  return path ? storageReference(path) : reference
}
