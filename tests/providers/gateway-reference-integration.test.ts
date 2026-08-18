import { afterEach, describe, expect, test } from 'vitest';
import { createReferenceGateway } from '../../scripts/reference-gateway-contract.mjs';
import { GatewayProvider, type WebSocketLike } from '../../src/providers/gateway/GatewayProvider';
import type { DecisionLifecycle, ProviderEvent } from '../../src/providers/types';

const BASE_TIME = Date.parse('2026-08-18T03:00:00.000Z');

function createInMemoryBridge(gateway: ReturnType<typeof createReferenceGateway>) {
  let handler: ((raw: unknown) => void) | null = null;

  const serverSocket = {
    readyState: 0,
    on(type: string, listener: (raw: unknown) => void) {
      if (type === 'message') handler = listener;
    },
    send(raw: string) {
      providerSocket.onmessage?.({ data: raw });
    },
    close() {
      providerSocket.onclose?.();
    },
  };

  const providerSocket: WebSocketLike = {
    readyState: 0,
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send(message: string) {
      handler?.(message);
    },
    close() {
      this.readyState = 3;
      this.onclose?.();
    },
  };

  gateway.attach(serverSocket as Parameters<typeof gateway.attach>[0]);

  return {
    providerSocket,
    open() {
      providerSocket.readyState = 1;
      serverSocket.readyState = 1;
      providerSocket.onopen?.();
    },
  };
}

function collectEventTypes(events: ProviderEvent[]) {
  return events.map((event) => event.type);
}

describe('reference Gateway + real GatewayProvider integration', () => {
  let provider: GatewayProvider | null = null;

  afterEach(() => {
    provider?.disconnect();
    provider = null;
  });

  test('runs the complete business loop through the actual client and server implementations', async () => {
    const gateway = createReferenceGateway({ deviceId: 'device-01', nowFn: () => BASE_TIME });
    const bridge = createInMemoryBridge(gateway);

    provider = new GatewayProvider({
      url: 'ws://in-memory.test',
      clientId: 'browser-1',
      deviceId: 'device-01',
      socketFactory: () => bridge.providerSocket,
      nowFn: () => BASE_TIME,
    });

    const events: ProviderEvent[] = [];
    provider.subscribe((event) => events.push(event));

    provider.connect();
    bridge.open();

    // hello -> hello_ack -> snapshot
    await vi.waitFor(() => {
      expect(events.some((event) => event.type === 'authorization' && event.authorization.status === 'authorized')).toBe(true);
      expect(events.some((event) => event.type === 'snapshot' && event.snapshotTrust.freshness === 'fresh')).toBe(true);
    });

    const snapshotEvent = events.find((event) => event.type === 'snapshot') as Extract<ProviderEvent, { type: 'snapshot' }>;
    expect(snapshotEvent.snapshot.inbox).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'codex-production-approval', status: 'pending' })]),
    );

    const lifecycle: DecisionLifecycle[] = [];
    provider.subscribe((event) => {
      if (event.type === 'command_lifecycle') lifecycle.push(event.lifecycle);
    });

    // approve against the reference gateway with the real provider decide() path
    const ackPromise = provider.decide({ itemId: 'codex-production-approval', agentId: 'codex', decision: 'approve' });
    const ack = await ackPromise;
    expect(ack).toMatchObject({ status: 'accepted', phase: 'pending_event' });

    await vi.waitFor(() => {
      expect(lifecycle.some((entry) => entry.phase === 'confirmed')).toBe(true);
      expect(events.some((event) => event.type === 'snapshot' && event.snapshotTrust.eventId === 'evt-2')).toBe(true);
    });

    const finalSnapshot = events.filter((event) => event.type === 'snapshot').at(-1) as Extract<ProviderEvent, { type: 'snapshot' }>;
    expect(finalSnapshot.snapshot.inbox[0]).toMatchObject({ id: 'codex-production-approval', status: 'approved' });
    expect(collectEventTypes(events)).toEqual(expect.arrayContaining(['authorization', 'snapshot', 'command_ack', 'command_lifecycle']));
  });

  test('runs the browser pairing flow through the actual client and server implementations', async () => {
    const gateway = createReferenceGateway({ deviceId: 'device-01', nowFn: () => BASE_TIME });
    const bridge = createInMemoryBridge(gateway);

    provider = new GatewayProvider({
      url: 'ws://in-memory.test',
      clientId: 'browser-1',
      deviceId: 'device-01',
      auth: null,
      socketFactory: () => bridge.providerSocket,
      nowFn: () => BASE_TIME,
      reconnectDelaysMs: [],
    });

    const events: ProviderEvent[] = [];
    provider.subscribe((event) => events.push(event));

    provider.connect();
    bridge.open();

    await vi.waitFor(() => {
      expect(events.some((event) => event.type === 'authorization' && event.authorization.status === 'pairing_required')).toBe(true);
      expect(events.some((event) => event.type === 'connection' && event.state === 'pairing_required')).toBe(true);
    });

    provider.beginPairing();
    await vi.waitFor(() => {
      expect(events.some((event) => event.type === 'pairing' && event.pairing.status === 'challenge')).toBe(true);
    });
    const challenge = events.filter((event) => event.type === 'pairing').at(-1);
    if (challenge?.type !== 'pairing' || challenge.pairing.status !== 'challenge') {
      throw new Error('expected a pairing challenge event');
    }

    provider.confirmPairing(challenge.pairing.pairingId, challenge.pairing.displayCode);
    await vi.waitFor(() => {
      expect(events.some((event) => event.type === 'authorization' && event.authorization.status === 'authorized')).toBe(true);
      expect(events.some((event) => event.type === 'snapshot' && event.snapshotTrust.freshness === 'fresh')).toBe(true);
    });

    const pairedEvent = events.find((event) => event.type === 'pairing' && event.pairing.status === 'paired');
    expect(pairedEvent).toEqual(expect.objectContaining({
      type: 'pairing',
      pairing: expect.objectContaining({ status: 'paired' }),
    }));
    const finalEvent = events.filter((event) => event.type === 'pairing').at(-1);
    expect(finalEvent).toEqual(expect.objectContaining({
      pairing: expect.objectContaining({ status: 'idle' }),
    }));
    expect(events.some((event) => event.type === 'connection' && event.state === 'connected')).toBe(true);
  });
});
