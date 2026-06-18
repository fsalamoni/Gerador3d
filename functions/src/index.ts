/**
 * Gerador3D — Cloud Functions proxy for 3D generation providers.
 *
 * Why a proxy (vs. calling providers directly from the browser like Lexio does
 * for LLMs): 3D generation is asynchronous, returns large binaries and the
 * provider APIs are CORS-restricted. The proxy also keeps each user's API key
 * (BYOK) read server-side from their Firestore settings and persists finished
 * assets into Storage.
 *
 * Two callables:
 *  - generate3d : creates the job, dispatches to the provider, returns { jobId }.
 *  - pollJob3d  : advances one provider poll, persists assets on success and
 *                 returns the updated job (the client polls this).
 */
import { setGlobalOptions } from 'firebase-functions/v2';
import * as logger from 'firebase-functions/logger';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { Firestore } from '@google-cloud/firestore';
import { meshyDispatch, meshyPoll, type TaskKey } from './meshy.js';
import { tripoDispatch, tripoPoll } from './tripo.js';
import { persistAsset } from './storage.js';
import { bumpJobCreated, bumpJobTerminal } from './stats.js';

initializeApp();

const db = new Firestore({
  projectId: process.env.GCLOUD_PROJECT || 'antonov-82411',
  databaseId: 'gerador3d'
});

setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10,
  memory: '512MiB',
  timeoutSeconds: 120,
});

const TERMINAL = new Set(['succeeded', 'failed', 'canceled'])

function capabilityFor(task: TaskKey): string {
  if (task === 'rigging') return 'rigging'
  return task === 'text_to_3d' ? 'text-to-3d' : 'image-to-3d'
}

interface Prefs {
  api_keys?: Record<string, string>
  provider_settings?: Record<string, { base_url?: string }>
}

async function loadCreds(uid: string, providerId: string) {
  const snap = await db.doc(`users/${uid}/settings/preferences`).get()
  const prefs = (snap.data() as Prefs | undefined) ?? {}
  const apiKey = prefs.api_keys?.[`${providerId}_api_key`] ?? ''
  const baseUrl = prefs.provider_settings?.[providerId]?.base_url ?? ''
  return { apiKey, baseUrl }
}

/** Storage path where the local worker uploads the rigged VRM. */
function riggedVrmPath(uid: string, jobId: string): string {
  return `antonov3d/users/${uid}/models/${jobId}/model.vrm`
}

/**
 * Signed URL the worker uses to PUT the finished VRM straight into Storage.
 * The worker sends `Content-Type: application/octet-stream`, so the URL must be
 * signed with the same content type. Short lived — the job finishes in minutes.
 */
async function createWorkerUploadUrl(uid: string, jobId: string): Promise<string> {
  const file = getStorage().bucket().file(riggedVrmPath(uid, jobId))
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 60 * 60 * 1000, // 1 hour
    contentType: 'application/octet-stream',
  })
  return url
}

/** Long-lived signed read URL for the rigged VRM once the worker uploaded it. */
async function readRiggedVrmUrl(uid: string, jobId: string): Promise<string> {
  const file = getStorage().bucket().file(riggedVrmPath(uid, jobId))
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: '03-01-2500',
  })
  return url
}

// ── generate3d ────────────────────────────────────────────────────────────────

export const generate3d = onCall(async (request) => {
  try {
    const uid = request.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.')

    const data = request.data as {
      jobId: string
      task: TaskKey
      modelId: string
      providerId: string
      prompt?: string
      imageDataUrl?: string
    }

    const { jobId, task, modelId, providerId } = data
    if (!jobId || !task || !modelId || !providerId) {
      throw new HttpsError('invalid-argument', 'Missing required fields.')
    }

    const now = new Date().toISOString()
    const jobRef = db.doc(`users/${uid}/jobs/${jobId}`)
    await jobRef.set({
      id: jobId,
      uid,
      task: capabilityFor(task),
      providerId,
      modelId,
      status: 'pending',
      progress: 0,
      params: { prompt: data.prompt ?? '', hasImage: Boolean(data.imageDataUrl), taskKey: task },
      created_at: now,
      updated_at: now,
    })

    void bumpJobCreated(providerId, capabilityFor(task))

    const SUPPORTED = new Set(['meshy', 'tripo', 'local', 'selfhost'])
    if (!SUPPORTED.has(providerId)) {
      await jobRef.update({
        status: 'failed',
        error: `Provider "${providerId}" is not yet implemented in the proxy.`,
        updated_at: new Date().toISOString(),
      })
      void bumpJobTerminal('failed')
      throw new HttpsError('unimplemented', `Provider "${providerId}" not implemented yet.`)
    }

    // Self-hosted / local worker dispatch (rigging or other custom tasks)
    if (providerId === 'selfhost' || providerId === 'local') {
      const creds = await loadCreds(uid, providerId)
      const baseUrl = creds.baseUrl?.replace(/\/+$/, '') // remove trailing slashes
      
      if (!baseUrl) {
        await jobRef.update({
          status: 'failed',
          error: 'No worker URL configured for the self-hosted provider.',
          updated_at: new Date().toISOString(),
        })
        void bumpJobTerminal('failed')
        throw new HttpsError('failed-precondition', 'Configure a worker URL for the self-hosted provider.')
      }

      // The frontend passes the source model download link as `prompt`.
      const sourceUrl = data.prompt || ''
      if (!sourceUrl) {
        await jobRef.update({
          status: 'failed',
          error: 'No source model URL provided for rigging.',
          updated_at: new Date().toISOString(),
        })
        void bumpJobTerminal('failed')
        throw new HttpsError('invalid-argument', 'Missing source model URL for rigging.')
      }

      // Pre-sign the destination so the worker can upload the VRM straight into
      // the user's Storage folder (no service-account key on the worker side).
      const uploadUrl = await createWorkerUploadUrl(uid, jobId)

      // Dispatch to the local worker (FastAPI)
      const workerEndpoint = `${baseUrl}/api/rig`
      logger.info('Dispatching rigging to local worker:', workerEndpoint)

      const workerPayload = {
        downloadUrl: sourceUrl,
        uploadUrl,
      }

      try {
        const fetch = (await import('node-fetch')).default;
        const workerResp = await fetch(workerEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(workerPayload),
        })
        
        if (!workerResp.ok) {
          throw new Error(`Worker returned ${workerResp.status}: ${await workerResp.text()}`);
        }

        const workerResult = await workerResp.json() as { taskId: string };
        
        await jobRef.update({
          status: 'in_progress',
          progress: 10,
          providerTaskId: workerResult.taskId,
          params: {
            prompt: data.prompt ?? '',
            hasImage: Boolean(data.imageDataUrl),
            taskKey: task,
            stage: 'worker_processing',
          },
          updated_at: new Date().toISOString(),
        })
        
        return { jobId }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Worker dispatch failed.'
        await jobRef.update({
          status: 'failed',
          error: `Worker unreachable. Is the local server running? (${message})`,
          updated_at: new Date().toISOString(),
        })
        void bumpJobTerminal('failed')
        throw new HttpsError('internal', message)
      }
    }

    // Cloud provider dispatch (Meshy / Tripo). The only keyless path is the
    // Meshy rigging mock; every real generation needs the user's BYOK key.
    const { apiKey, baseUrl } = await loadCreds(uid, providerId)
    const keyOptional = providerId === 'meshy' && task === 'rigging'
    if (!keyOptional && !apiKey) {
      await jobRef.update({
        status: 'failed',
        error: 'Missing API key for this provider.',
        updated_at: new Date().toISOString(),
      })
      void bumpJobTerminal('failed')
      throw new HttpsError('failed-precondition', 'Missing API key for this provider.')
    }

    try {
      const dispatchArgs = {
        task,
        modelId,
        prompt: data.prompt,
        imageDataUrl: data.imageDataUrl,
        apiKey,
        baseUrl,
      }
      const dispatch =
        providerId === 'tripo'
          ? await tripoDispatch(dispatchArgs)
          : await meshyDispatch(dispatchArgs)
      await jobRef.update({
        status: 'in_progress',
        progress: 1,
        providerTaskId: dispatch.providerTaskId,
        params: {
          prompt: data.prompt ?? '',
          hasImage: Boolean(data.imageDataUrl),
          taskKey: task,
          stage: dispatch.stage,
        },
        updated_at: new Date().toISOString(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Dispatch failed.'
      await jobRef.update({
        status: 'failed',
        error: message,
        updated_at: new Date().toISOString(),
      })
      void bumpJobTerminal('failed')
      throw new HttpsError('internal', message)
    }

    return { jobId }
  } catch (err) {
    logger.error('generate3d error:', err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err instanceof Error ? err.message : 'Unknown error');
  }
})

// ── pollJob3d ─────────────────────────────────────────────────────────────────

export const pollJob3d = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.')

  const { jobId } = request.data as { jobId: string }
  if (!jobId) throw new HttpsError('invalid-argument', 'Missing jobId.')

  const jobRef = db.doc(`users/${uid}/jobs/${jobId}`)
  const snap = await jobRef.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Job not found.')

  const job = snap.data() as Record<string, any>
  if (TERMINAL.has(job.status)) return job

  if (!['meshy', 'tripo', 'selfhost', 'local'].includes(job.providerId)) {
    return job
  }

  // Self-hosted / local worker polling
  if (job.providerId === 'selfhost' || job.providerId === 'local') {
    const creds = await loadCreds(uid, job.providerId)
    const baseUrl = creds.baseUrl?.replace(/\/+$/, '')
    
    if (!baseUrl || !job.providerTaskId) {
      return job
    }

    try {
      const fetch = (await import('node-fetch')).default;
      const statusResp = await fetch(`${baseUrl}/api/status/${job.providerTaskId}`)
      if (!statusResp.ok) {
        return job
      }
      
      const workerStatus = await statusResp.json() as {
        status: string
        progress: number
        error?: string
      }

      const patch: Record<string, any> = {
        progress: workerStatus.progress || job.progress,
        updated_at: new Date().toISOString(),
      }

      if (workerStatus.status === 'succeeded') {
        patch.status = 'succeeded'
        patch.progress = 100
        // The worker uploaded the VRM to the path we pre-signed at dispatch.
        // Hand back a long-lived signed read URL for it.
        patch.outputs = { vrmUrl: await readRiggedVrmUrl(uid, jobId) }
      } else if (workerStatus.status === 'failed') {
        patch.status = 'failed'
        patch.error = workerStatus.error || 'Worker processing failed'
      }

      await jobRef.update(patch)
      if (TERMINAL.has(patch.status)) void bumpJobTerminal(patch.status)
      return { ...job, ...patch }
    } catch {
      // Worker unreachable, keep current status
      return job
    }
  }

  const { apiKey, baseUrl } = await loadCreds(uid, job.providerId)
  const taskKey = (job.params?.taskKey ?? 'text_to_3d') as TaskKey

  try {
    const pollArgs = {
      task: taskKey,
      providerTaskId: job.providerTaskId,
      stage: job.params?.stage ?? (taskKey === 'text_to_3d' ? 'preview' : 'single'),
      apiKey,
      baseUrl,
      sourceUrl: job.params?.prompt,
    }
    const outcome =
      job.providerId === 'tripo' ? await tripoPoll(pollArgs) : await meshyPoll(pollArgs)

    const patch: Record<string, any> = {
      status: outcome.status,
      progress: outcome.progress,
      updated_at: new Date().toISOString(),
    }
    if (outcome.providerTaskId) patch.providerTaskId = outcome.providerTaskId
    if (outcome.stage) patch.params = { ...job.params, stage: outcome.stage }
    if (outcome.error) patch.error = outcome.error

    if (outcome.status === 'succeeded' && outcome.glbUrl) {
      const isRigging = taskKey === 'rigging'
      const ext = isRigging ? 'model.vrm' : 'model.glb'
      const assetUrl = await persistAsset(uid, jobId, ext, outcome.glbUrl)
      
      let thumbnailUrl: string | undefined
      if (outcome.thumbnailUrl) {
        thumbnailUrl = await persistAsset(uid, jobId, 'thumb.png', outcome.thumbnailUrl)
      }
      
      patch.outputs = isRigging 
        ? { vrmUrl: assetUrl, thumbnailUrl }
        : { glbUrl: assetUrl, thumbnailUrl }
    }

    await jobRef.update(patch)
    if (TERMINAL.has(outcome.status)) void bumpJobTerminal(outcome.status)
    return { ...job, ...patch }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Poll failed.'
    await jobRef.update({
      status: 'failed',
      error: message,
      updated_at: new Date().toISOString(),
    })
    void bumpJobTerminal('failed')
    throw new HttpsError('internal', message)
  }
})
