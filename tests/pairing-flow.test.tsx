import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { GatewayProvider } from '../src/providers/gateway/GatewayProvider';
import { FixtureProvider } from '../src/providers/fixture/FixtureProvider';
import { PairingPanel } from '../src/components/PairingPanel';
import { useAhtRuntime } from '../src/app/useAhtRuntime';
import type { GatewaySnapshot } from '../src/providers/protocol';
import type { ProviderEvent } from '../src/providers/types';

class FakeSocket {
  static instances: FakeSocket[] = [];
  readonly sent: string[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public readonly url: string) {
    FakeSocket.instances.push(this);
  }

  send(message: string): void {
    this.sent.push(message);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const snapshot: GatewaySnapshot = {
  source: 'gateway',
  schema_version: 1,
  revision: 1,
  event_id: 'evt-1',
  generated_at: '2026-08-18T03:00:00.000Z',
  tenant_id: 'tenant-01',
  principal_id: 'user-01',
  device_id: 'device-01',
  permission_scope: ['needs_you:read', 'needs_you:write'],
  agents: [{
    id: 'codex', type: 'codex', name: 'Codex', model: 'codex', server: 'tokyo-01',
    workspace: '/aht', session: 'codex-remote-1', status: 'waiting_approval',
    current_task: '生产部署审批', elapsed_seconds: 23, needs_user: true,
    maturity: 'beta', capabilities: { approval: true },
  }],
  sessions: [{
    id: 'codex-remote-1', agent_id: 'codex', status: 'waiting_approval', title: '生产部署审批',
    started_at: '2026-08-18T02:59:00.000Z', updated_at: '2026-08-18T03:00:00.000Z',
  }],
  needs_you: [{
    id: 'remote-approval', agent_id: 'codex', type: 'approval', title: '远程审批',
    detail: '来自 Gateway 的审批', risk: 'high', created_at: '2026-08-18T03:00:00.000Z',
    status: 'pending', actions: ['approve', 'reject'],
  }],
  servers: [],
  network: null,
};

function pairingRequiredAck(): unknown {
  return {
    protocol: 'aht.gateway.v1', type: 'hello_ack', message_id: 'msg-pairing-ack', connection_id: 'conn-1',
    session: { id: 'session-pairing', principal_id: null, tenant_id: null, device_id: 'device-01', expires_at: null },
    authorization: { status: 'pairing_required', permission_scope: [], reason: 'credential_missing' },
    server_time: '2026-08-18T03:00:01.000Z', resume_supported: true, capabilities: ['pairing'],
  };
}

afterEach(() => {
  FakeSocket.instances = [];
});

describe('browser pairing flow', () => {
  test('runtime exposes pairing state and reaches an authorized gateway snapshot', () => {
    const provider = new GatewayProvider({
      url: 'ws://gateway.test',
      clientId: 'test-client',
      deviceId: 'device-01',
      socketFactory: (url) => new FakeSocket(url),
      nowFn: () => Date.parse('2026-08-18T03:00:01.000Z'),
      reconnectDelaysMs: [],
    });
    const { result } = renderHook(() => useAhtRuntime({
      initialSource: 'gateway',
      gatewayProviderFactory: () => provider,
    }));
    const socket = FakeSocket.instances[0];

    act(() => socket?.open());
    act(() => socket?.receive(pairingRequiredAck()));
    expect(result.current.connection).toBe('pairing_required');

    act(() => result.current.beginPairing());
    act(() => socket?.receive({
      protocol: 'aht.gateway.v1', type: 'pairing_challenge', message_id: 'msg-challenge',
      pairing_id: 'pairing-1', expires_at: '2026-08-18T03:05:00.000Z', display_code: '000000',
    }));
    expect(result.current.pairing).toEqual(expect.objectContaining({ status: 'challenge', displayCode: '000000' }));

    act(() => result.current.confirmPairing('pairing-1', '000000'));
    act(() => socket?.receive({
      protocol: 'aht.gateway.v1', type: 'pairing_result', message_id: 'msg-result',
      pairing_id: 'pairing-1', status: 'paired', credential_ref: 'paired:device-01:000001', reason: null,
    }));
    expect(result.current.pairing).toEqual(expect.objectContaining({ status: 'paired', credentialRef: 'paired:device-01:000001' }));
    expect(JSON.parse(socket?.sent.at(-1) ?? '{}')).toMatchObject({
      type: 'hello',
      auth: { mode: 'paired_session', credential_ref: 'paired:device-01:000001' },
    });

    act(() => socket?.receive({
      protocol: 'aht.gateway.v1', type: 'hello_ack', message_id: 'msg-ack-authorized', connection_id: 'conn-2',
      session: { id: 'session-aht', principal_id: 'user-01', tenant_id: 'tenant-01', device_id: 'device-01', expires_at: null },
      authorization: { status: 'authorized', permission_scope: snapshot.permission_scope, reason: null },
      server_time: '2026-08-18T03:00:02.000Z', resume_supported: true, capabilities: ['needs_you:write'],
    }));
    act(() => socket?.receive({
      protocol: 'aht.gateway.v1', type: 'snapshot', message_id: 'msg-snapshot-1', event_id: 'evt-1', snapshot,
    }));

    expect(result.current.connection).toBe('connected');
    expect(result.current.authorization).toMatchObject({ status: 'authorized', sessionId: 'session-aht' });
    expect(result.current.pairing).toEqual({ status: 'idle' });
    expect(result.current.snapshotTrust.freshness).toBe('fresh');
    expect(result.current.decisionGate.allowed).toBe(true);
  });

  test('runtime keeps pairing_required instead of clobbering it with a generic error', () => {
    const provider = new GatewayProvider({
      url: 'ws://gateway.test',
      deviceId: 'device-01',
      socketFactory: (url) => new FakeSocket(url),
      reconnectDelaysMs: [],
    });
    const { result } = renderHook(() => useAhtRuntime({
      initialSource: 'gateway',
      gatewayProviderFactory: () => provider,
    }));
    const socket = FakeSocket.instances[0];
    act(() => socket?.open());
    act(() => socket?.receive(pairingRequiredAck()));
    expect(result.current.connection).toBe('pairing_required');
    expect(result.current.error).toBe('credential_missing');
  });
});

describe('PairingPanel', () => {
  test('shows the challenge code and confirms with the displayed code', () => {
    let confirmed: { pairingId: string; code: string } | null = null;
    render(
      <PairingPanel
        pairing={{ status: 'challenge', pairingId: 'pairing-1', displayCode: '000000', expiresAt: '2026-08-18T03:05:00.000Z' }}
        onBeginPairing={() => {}}
        onConfirmPairing={(pairingId, code) => { confirmed = { pairingId, code }; }}
      />,
    );
    expect(screen.getByTestId('pairing-code')).toHaveTextContent('000000');
    act(() => screen.getByText('确认设备已显示此代码').click());
    expect(confirmed).toEqual({ pairingId: 'pairing-1', code: '000000' });
  });

  test('offers a retry after rejection', () => {
    let began = false;
    render(
      <PairingPanel
        pairing={{ status: 'rejected', reason: 'pairing_code_invalid' }}
        onBeginPairing={() => { began = true; }}
        onConfirmPairing={() => {}}
      />,
    );
    expect(screen.getByText(/配对失败/)).toHaveTextContent('pairing_code_invalid');
    act(() => screen.getByText('重新开始配对').click());
    expect(began).toBe(true);
  });
});

describe('FixtureProvider pairing honesty', () => {
  test('never pretends fixture mode can pair with a gateway', () => {
    const events: ProviderEvent[] = [];
    const provider = new FixtureProvider();
    provider.subscribe((event) => events.push(event));
    provider.beginPairing();
    provider.confirmPairing('pairing-x', '000000');
    expect(events.filter((event) => event.type === 'pairing')).toHaveLength(2);
    expect(events.filter((event) => event.type === 'pairing').every((event) => event.type === 'pairing' && event.pairing.status === 'rejected')).toBe(true);
  });
});
