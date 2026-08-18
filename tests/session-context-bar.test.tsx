import { render, screen } from '@testing-library/react';
import { SessionContextBar } from '../src/components/SessionContextBar';
import type { ProviderAuthorization, SnapshotTrust } from '../src/providers/types';

const freshTrust: SnapshotTrust = {
  source: 'gateway',
  eventId: 'evt-1',
  revision: 1,
  generatedAt: '2026-08-18T03:00:00.000Z',
  receivedAt: '2026-08-18T03:00:01.000Z',
  freshness: 'fresh',
  staleReason: null,
  permissionScope: ['needs_you:read', 'needs_you:write'],
};

const authorized: ProviderAuthorization = {
  status: 'authorized',
  sessionId: 'sess-000001',
  principalId: 'user-01',
  tenantId: 'tenant-01',
  deviceId: 'device-42',
  expiresAt: '2026-08-18T11:00:00.000Z',
  permissionScope: ['needs_you:read', 'needs_you:write'],
  reason: null,
};

describe('SessionContextBar', () => {
  test('labels fixture mode without inventing a gateway session', () => {
    render(
      <SessionContextBar
        source="fixture"
        connection="connected"
        authorization={{ ...authorized, status: 'authorized' }}
        snapshotTrust={{ ...freshTrust, source: 'fixture' }}
      />,
    );
    expect(screen.getByTestId('session-context-bar')).toHaveTextContent('本地模拟数据 · 无 Gateway 会话');
  });

  test('shows session, tenant, principal, device, scope, expiry and snapshot freshness when authorized', () => {
    render(
      <SessionContextBar
        source="gateway"
        connection="connected"
        authorization={authorized}
        snapshotTrust={freshTrust}
      />,
    );
    const bar = screen.getByTestId('session-context-bar');
    expect(bar).toHaveTextContent('会话 sess-000001');
    expect(bar).toHaveTextContent('租户 tenant-01');
    expect(bar).toHaveTextContent('主体 user-01');
    expect(bar).toHaveTextContent('设备 device-42');
    expect(bar).toHaveTextContent('权限 needs_you:read needs_you:write');
    expect(bar).toHaveTextContent('过期 2026-08-18T11:00:00Z');
    expect(bar).toHaveTextContent('快照 evt-1 r1');
    expect(bar).toHaveTextContent('新鲜');
  });

  test('shows long-lived session when the gateway sends no expiry', () => {
    render(
      <SessionContextBar
        source="gateway"
        connection="connected"
        authorization={{ ...authorized, expiresAt: null }}
        snapshotTrust={freshTrust}
      />,
    );
    expect(screen.getByTestId('session-context-bar')).toHaveTextContent('过期 长期有效');
  });

  test('fails closed when an authorized session has an incomplete context', () => {
    render(
      <SessionContextBar
        source="gateway"
        connection="connected"
        authorization={{ ...authorized, tenantId: null, principalId: null }}
        snapshotTrust={freshTrust}
      />,
    );
    expect(screen.getByTestId('session-context-bar')).toHaveTextContent('会话上下文不完整 · 决策已锁定');
  });

  test('shows pairing required and unauthorized reasons without exposing success', () => {
    const { unmount } = render(
      <SessionContextBar
        source="gateway"
        connection="pairing_required"
        authorization={{ ...authorized, status: 'pairing_required', sessionId: null, tenantId: null, principalId: null, permissionScope: [], reason: 'credential_missing' }}
        snapshotTrust={{ ...freshTrust, freshness: 'unknown', eventId: null, revision: null, generatedAt: null, receivedAt: null, staleReason: 'snapshot_unavailable', permissionScope: [] }}
      />,
    );
    expect(screen.getByTestId('session-context-bar')).toHaveTextContent('需要配对 · 尚未注册此设备');
    unmount();

    render(
      <SessionContextBar
        source="gateway"
        connection="unauthorized"
        authorization={{ ...authorized, status: 'unauthorized', sessionId: null, tenantId: null, principalId: null, permissionScope: [], reason: 'credential_revoked' }}
        snapshotTrust={{ ...freshTrust, freshness: 'unknown', eventId: null, revision: null, generatedAt: null, receivedAt: null, staleReason: 'credential_revoked', permissionScope: [] }}
      />,
    );
    expect(screen.getByTestId('session-context-bar')).toHaveTextContent('未授权 · 凭证已吊销 · 决策已锁定');
  });
});
