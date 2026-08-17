import { expect, test } from 'vitest';
import { applyGatewayEvent, applyGatewayEventMessage, toFixtureState } from '../../src/providers/gateway/reducer';
import type { GatewaySnapshot } from '../../src/providers/protocol';

const snapshot: GatewaySnapshot = {
  source: 'gateway',
  schema_version: 1,
  revision: 7,
  event_id: 'evt-7',
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
    started_at: '2026-08-17T11:59:00Z', updated_at: '2026-08-18T03:00:00Z',
  }],
  needs_you: [{
    id: 'remote-approval', agent_id: 'codex', type: 'approval', title: '远程审批',
    detail: '来自 Gateway 的审批', risk: 'high', created_at: '2026-08-17T12:00:00Z',
    status: 'pending', actions: ['approve', 'reject'],
  }],
  servers: [],
  network: { link: '4G', rtt_ms: 38, vpn: true },
};

test('maps a Gateway snapshot into the existing UI state without fixture records', () => {
  const state = toFixtureState(snapshot);

  expect(state.inbox).toHaveLength(1);
  expect(state.inbox[0]?.id).toBe('remote-approval');
  expect(state.inbox[0]?.detail).toBe('来自 Gateway 的审批');
  expect(state.agents[0]?.session).toBe('codex-remote-1');
  expect(state.servers).toHaveLength(0);
  expect(state.network.rtt).toBe(38);
});

test('applies a needs-you resolution as a new Gateway snapshot revision', () => {
  const next = applyGatewayEvent(snapshot, {
    type: 'needs_you_resolved',
    needs_you_id: 'remote-approval',
    status: 'approved',
    command_id: 'cmd-01',
  });

  expect(next.revision).toBe(8);
  expect(next.event_id).toBe('evt-7');
  expect(next.needs_you[0]?.status).toBe('approved');
});

test('applies an audited event only at the next revision', () => {
  const result = applyGatewayEventMessage(snapshot, {
    protocol: 'aht.gateway.v1', type: 'event', message_id: 'msg-event',
    event_id: 'evt-8', revision: 8, generated_at: '2026-08-18T03:00:01.000Z',
    actor: { kind: 'user', id: 'user-01' },
    audit: {
      tenant_id: 'tenant-01', principal_id: 'user-01', device_id: 'device-01', session_id: 'session-aht',
      command_id: 'cmd-01', source_event_id: 'evt-7', source_revision: 7,
    },
    event: { type: 'needs_you_resolved', needs_you_id: 'remote-approval', status: 'approved', command_id: 'cmd-01' },
  });

  expect(result).toMatchObject({ status: 'applied', reason: null });
  expect(result.snapshot).toMatchObject({ revision: 8, event_id: 'evt-8', generated_at: '2026-08-18T03:00:01.000Z' });
  expect(result.snapshot.needs_you[0]?.status).toBe('approved');
});

test('fails closed on revision gaps, replayed ids and missing event targets', () => {
  const baseMessage = {
    protocol: 'aht.gateway.v1' as const, type: 'event' as const, message_id: 'msg-event',
    event_id: 'evt-9', generated_at: '2026-08-18T03:00:01.000Z',
    actor: { kind: 'system' as const, id: 'gateway' },
    audit: {
      tenant_id: 'tenant-01', principal_id: 'user-01', device_id: 'device-01', session_id: 'session-aht',
      command_id: null, source_event_id: 'evt-7', source_revision: 7,
    },
    event: { type: 'needs_you_resolved' as const, needs_you_id: 'remote-approval', status: 'approved' as const, command_id: null },
  };

  expect(applyGatewayEventMessage(snapshot, { ...baseMessage, revision: 10 })).toMatchObject({
    status: 'resync_required', reason: 'event_revision_gap', snapshot,
  });
  expect(applyGatewayEventMessage(snapshot, { ...baseMessage, event_id: 'evt-7', revision: 8 })).toMatchObject({
    status: 'resync_required', reason: 'event_id_reused', snapshot,
  });
  expect(applyGatewayEventMessage(snapshot, { ...baseMessage, revision: 8, event: { ...baseMessage.event, needs_you_id: 'missing' } })).toMatchObject({
    status: 'invalid_event', reason: 'event_target_missing', snapshot,
  });
});
