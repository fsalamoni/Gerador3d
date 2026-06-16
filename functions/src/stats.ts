/**
 * Platform-wide aggregate analytics, maintained server-side by the proxy.
 *
 * These are non-sensitive counters (totals by provider / task / status) stored
 * at `/platform/stats`. The Admin SDK bypasses Firestore rules, and the rules
 * forbid any client write, so this document is the single source of truth for
 * the Admin panel's platform overview.
 *
 * All writes are best-effort: a failure here must never break a generation.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { Firestore } from '@google-cloud/firestore';

const db = new Firestore({ databaseId: 'gerador3d' });

const STATS_PATH = 'platform/stats';

/** Increment counters when a new job is created. */
export async function bumpJobCreated(
  providerId: string,
  capability: string,
): Promise<void> {
  try {
    await db
      .doc(STATS_PATH)
      .set(
        {
          totalJobs: FieldValue.increment(1),
          byProvider: { [providerId]: FieldValue.increment(1) },
          byTask: { [capability]: FieldValue.increment(1) },
          updated_at: new Date().toISOString(),
        },
        { merge: true },
      );
  } catch {
    // Non-critical analytics write; ignore.
  }
}

/** Increment the status counter when a job reaches a terminal state. */
export async function bumpJobTerminal(status: string): Promise<void> {
  try {
    await db
      .doc(STATS_PATH)
      .set(
        {
          byStatus: { [status]: FieldValue.increment(1) },
          updated_at: new Date().toISOString(),
        },
        { merge: true },
      );
  } catch {
    // Non-critical analytics write; ignore.
  }
}