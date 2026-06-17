/**
 * Persists a remote provider asset into the user's Storage bucket and returns a
 * long-lived signed read URL. Keeps generated models available after the
 * provider's temporary URLs expire.
 */
import { getStorage } from 'firebase-admin/storage'

function contentTypeFor(name: string): string {
  if (name.endsWith('.glb')) return 'model/gltf-binary'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.fbx')) return 'application/octet-stream'
  return 'application/octet-stream'
}

export async function persistAsset(
  uid: string,
  jobId: string,
  name: string,
  sourceUrl: string,
): Promise<string> {
  const res = await fetch(sourceUrl)
  if (!res.ok) {
    throw new Error(`Failed to download asset (${res.status}) from provider.`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())

  const bucket = getStorage().bucket()
  const file = bucket.file(`antonov3d/users/${uid}/models/${jobId}/${name}`)
  await file.save(buffer, {
    contentType: contentTypeFor(name),
    resumable: false,
  })

  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: '03-01-2500',
  })
  return url
}
