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
import { Firestore } from '@google-cloud/firestore';
import { meshyDispatch, meshyPoll, type TaskKey } from './meshy.js';
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

    if (providerId !== 'meshy' && providerId !== 'local' && providerId !== 'selfhost') {
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

      // Dispatch to the local worker (FastAPI)
      const workerEndpoint = `${baseUrl}/api/rig`
      logger.info('Dispatching rigging to local worker:', workerEndpoint)
      
      const workerPayload = {
        downloadUrl: data.prompt || '', // frontend passes the model download link as prompt
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

    // Pass API key check if it's a mock action like "local" provider or just rigging mock.
    let apiKey = ''
    let baseUrl = ''
    if (providerId === 'meshy' && task !== 'rigging') {
      const creds = await loadCreds(uid, providerId)
      apiKey = creds.apiKey
      baseUrl = creds.baseUrl
      if (!apiKey) {
        await jobRef.update({
          status: 'failed',
          error: 'Missing API key for this provider.',
          updated_at: new Date().toISOString(),
        })
        void bumpJobTerminal('failed')
        throw new HttpsError('failed-precondition', 'Missing API key for this provider.')
      }
    }

    try {
      const dispatch = await meshyDispatch({
        task,
        modelId,
        prompt: data.prompt,
        imageDataUrl: data.imageDataUrl,
        apiKey,
        baseUrl,
      })
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

  if (job.providerId !== 'meshy' && job.providerId !== 'selfhost' && job.providerId !== 'local') {
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
      
      const workerStatus = await statusResp.json() as { status: string; progress: number }
      
      const patch: Record<string, any> = {
        progress: workerStatus.progress || job.progress,
        updated_at: new Date().toISOString(),
      }

      if (workerStatus.status === 'succeeded') {
        patch.status = 'succeeded'
        patch.progress = 100
        // The worker uploaded the result to the storage URL we provided
        // We need to construct the final URL based on the job's storage path
        const storageBucket = process.env.GCLOUD_PROJECT ? `${process.env.GCLOUD_PROJECT}.firebasestorage.app` : 'antonov-82411.firebasestorage.app'
        const vrmUrl = `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/antonov3d%2Fusers%2F${uid}%2Fmodels%2F${jobId}%2Fmodel.vrm?alt=media`
        patch.outputs = { vrmUrl }
      } else if (workerStatus.status === 'failed') {
        patch.status = 'failed'
        patch.error = 'Worker processing failed'
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
    const outcome = await meshyPoll({
      task: taskKey,
      providerTaskId: job.providerTaskId,
      stage: job.params?.stage ?? (taskKey === 'text_to_3d' ? 'preview' : 'single'),
      apiKey,
      baseUrl,
      sourceUrl: job.params?.prompt,
    })

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
