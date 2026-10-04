import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  enqueueOfflineAction,
  getPendingActions,
  getPendingCount,
  clearOfflineQueue,
  replayOfflineQueue,
  updateActionStatus,
} from '../src/services/storage/offlineQueue.js';

describe('Offline Action Queue (offlineQueue)', () => {
  beforeEach(async () => {
    await clearOfflineQueue();
  });

  it('enqueues an action with a stable idempotency key and initial pending status', async () => {
    const action = await enqueueOfflineAction({
      type: 'ARRIVE',
      endpoint: '/agreements/agr-1/stops/stp-1/arrive',
      method: 'POST',
      idempotencyKey: 'idemp-stable-123',
      payload: { location: { latitude: 29.98, longitude: 31.12 } },
    });

    expect(action.id).toBeDefined();
    expect(action.idempotencyKey).toBe('idemp-stable-123');
    expect(action.status).toBe('pending');
    expect(action.retryCount).toBe(0);

    const pending = await getPendingActions();
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe(action.id);
  });

  it('preserves strict FIFO causal order based on timestamp', async () => {
    const action1 = await enqueueOfflineAction({
      type: 'ARRIVE',
      endpoint: '/agreements/agr-1/stops/stp-1/arrive',
      method: 'POST',
      idempotencyKey: 'idemp-1',
    });

    // Small delay to ensure timestamp progression
    await new Promise((r) => setTimeout(r, 10));

    const action2 = await enqueueOfflineAction({
      type: 'START_WAIT',
      endpoint: '/agreements/agr-1/stops/stp-1/wait/start',
      method: 'POST',
      idempotencyKey: 'idemp-2',
    });

    await new Promise((r) => setTimeout(r, 10));

    const action3 = await enqueueOfflineAction({
      type: 'COMPLETE_STOP',
      endpoint: '/agreements/agr-1/stops/stp-1/complete',
      method: 'POST',
      idempotencyKey: 'idemp-3',
    });

    const pending = await getPendingActions();
    expect(pending.length).toBe(3);
    expect(pending[0].id).toBe(action1.id);
    expect(pending[1].id).toBe(action2.id);
    expect(pending[2].id).toBe(action3.id);
  });

  it('replays actions through executor and removes completed ones', async () => {
    await enqueueOfflineAction({
      type: 'ARRIVE',
      endpoint: '/agreements/agr-1/stops/stp-1/arrive',
      method: 'POST',
      idempotencyKey: 'idemp-1',
    });

    await enqueueOfflineAction({
      type: 'START_WAIT',
      endpoint: '/agreements/agr-1/stops/stp-1/wait/start',
      method: 'POST',
      idempotencyKey: 'idemp-2',
    });

    const executedActions: string[] = [];
    const executor = vi.fn(async (action) => {
      executedActions.push(action.type);
      return { success: true };
    });

    const result = await replayOfflineQueue(executor);

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(0);
    expect(executedActions).toEqual(['ARRIVE', 'START_WAIT']);

    const remaining = await getPendingCount();
    expect(remaining).toBe(0);
  });

  it('stops downstream replay if an action fails, preserving causal order', async () => {
    await enqueueOfflineAction({
      type: 'ARRIVE',
      endpoint: '/agreements/agr-1/stops/stp-1/arrive',
      method: 'POST',
      idempotencyKey: 'idemp-1',
    });

    await enqueueOfflineAction({
      type: 'COMPLETE_STOP',
      endpoint: '/agreements/agr-1/stops/stp-1/complete',
      method: 'POST',
      idempotencyKey: 'idemp-2',
    });

    const executor = vi.fn(async (action) => {
      if (action.type === 'ARRIVE') {
        throw new Error('Network timeout');
      }
      return { success: true };
    });

    const result = await replayOfflineQueue(executor);

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);
    expect(executor).toHaveBeenCalledTimes(1); // Second action never attempted

    const pending = await getPendingActions();
    expect(pending.length).toBe(2);
    expect(pending[0].status).toBe('failed');
    expect(pending[0].retryCount).toBe(1);
  });

  it('updates action status and retry counts correctly', async () => {
    const action = await enqueueOfflineAction({
      type: 'ARRIVE',
      endpoint: '/agreements/agr-1/stops/stp-1/arrive',
      method: 'POST',
      idempotencyKey: 'idemp-1',
    });

    await updateActionStatus(action.id, 'failed', 'Temporary 503');
    const pending = await getPendingActions();

    expect(pending[0].status).toBe('failed');
    expect(pending[0].retryCount).toBe(1);
    expect(pending[0].errorMessage).toBe('Temporary 503');

    await updateActionStatus(action.id, 'completed');
    const count = await getPendingCount();
    expect(count).toBe(0);
  });
});
