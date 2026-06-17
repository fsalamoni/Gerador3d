import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { IS_FIREBASE, storage } from './firebase'
import { getCurrentUserId } from './firestore-service'
import { createJob } from './jobs-store'
import type { GenerationJob } from './firestore-types'

export async function upload3DModel(file: File, onProgress?: (progress: number) => void): Promise<GenerationJob> {
  const uid = getCurrentUserId()
  if (!uid) throw new Error('User not authenticated')

  const isVrm = file.name.toLowerCase().endsWith('.vrm')
  const ext = isVrm ? '.vrm' : '.glb'
  
  const jobId = `upload_${Date.now()}`
  const fileName = `model${ext}`
  
  // Create pending job
  const job: GenerationJob = {
    id: jobId,
    uid,
    task: 'upload',
    providerId: 'local',
    modelId: 'upload',
    status: 'in_progress',
    progress: 0,
    params: { prompt: `Upload: ${file.name}` },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  await createJob(job)

  let downloadUrl = ''

  if (IS_FIREBASE && storage) {
    const storageRef = ref(storage, `antonov3d/users/${uid}/uploads/${jobId}/${fileName}`)
    const uploadTask = uploadBytesResumable(storageRef, file)

    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          if (onProgress) onProgress(progress)
        },
        (error) => reject(error),
        async () => {
          downloadUrl = await getDownloadURL(uploadTask.snapshot.ref)
          resolve()
        }
      )
    })
  } else {
    // Demo mode: fake upload delay and use object URL
    downloadUrl = URL.createObjectURL(file)
    for (let i = 0; i <= 100; i += 10) {
      if (onProgress) onProgress(i)
      await new Promise(r => setTimeout(r, 100))
    }
  }

  const outputs: Record<string, string> = {}
  if (isVrm) {
    outputs.vrmUrl = downloadUrl
  } else {
    outputs.glbUrl = downloadUrl
  }

  // Update job to succeeded with outputs
  const updatedJob: GenerationJob = {
    ...job,
    status: 'succeeded',
    progress: 100,
    outputs,
    updated_at: new Date().toISOString(),
  }
  
  // we need to call updateJob, let's import it
  const { updateJob } = await import('./jobs-store')
  await updateJob(jobId, {
    status: 'succeeded',
    progress: 100,
    outputs,
    updated_at: updatedJob.updated_at
  })

  return updatedJob
}
