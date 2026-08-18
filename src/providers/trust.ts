import type { ConnectionState, DataSource, DecisionGate, DecisionGateReason, SnapshotTrust } from './types';
import type { GatewaySnapshot } from './protocol';

export const DEFAULT_GATEWAY_SNAPSHOT_MAX_AGE_MS = 30_000;
export const GATEWAY_WRITE_SCOPE = 'needs_you:write';

export function deriveGatewaySnapshotTrust(
  snapshot: GatewaySnapshot,
  receivedAtMs: number,
  nowMs: number,
  maxAgeMs: number = DEFAULT_GATEWAY_SNAPSHOT_MAX_AGE_MS,
): SnapshotTrust {
  const generatedAtMs = Date.parse(snapshot.generated_at);
  const receivedAt = new Date(receivedAtMs).toISOString();
  const base: SnapshotTrust = {
    source: 'gateway',
    eventId: snapshot.event_id,
    revision: snapshot.revision,
    generatedAt: snapshot.generated_at,
    receivedAt,
    freshness: 'unknown',
    staleReason: null,
    permissionScope: [...snapshot.permission_scope],
  };

  if (!Number.isFinite(generatedAtMs)) {
    return { ...base, staleReason: 'invalid_generated_at' };
  }
  if (generatedAtMs > nowMs) {
    return { ...base, staleReason: 'generated_in_future' };
  }
  if (nowMs - generatedAtMs > maxAgeMs) {
    return { ...base, freshness: 'stale', staleReason: 'snapshot_expired' };
  }
  return { ...base, freshness: 'fresh' };
}

export function createFixtureSnapshotTrust(now: Date): SnapshotTrust {
  const timestamp = now.toISOString();
  return {
    source: 'fixture',
    eventId: 'fixture',
    revision: 0,
    generatedAt: timestamp,
    receivedAt: timestamp,
    freshness: 'fresh',
    staleReason: null,
    permissionScope: ['development:fixture', GATEWAY_WRITE_SCOPE],
  };
}

export function createUnknownGatewaySnapshotTrust(reason = 'snapshot_unavailable'): SnapshotTrust {
  return {
    source: 'gateway',
    eventId: null,
    revision: null,
    generatedAt: null,
    receivedAt: null,
    freshness: 'unknown',
    staleReason: reason,
    permissionScope: [],
  };
}

export function markSnapshotTrustStale(trust: SnapshotTrust, reason: string): SnapshotTrust {
  return { ...trust, freshness: 'stale', staleReason: reason };
}

export function getDecisionGate(
  source: DataSource,
  connection: ConnectionState,
  trust: SnapshotTrust,
): DecisionGate {
  if (source === 'fixture') return { allowed: true, reason: null };
  if (connection === 'pairing_required' || connection === 'unauthorized') {
    return { allowed: false, reason: 'gateway_not_authorized' };
  }
  if (connection !== 'connected') return { allowed: false, reason: 'gateway_not_connected' };
  if (trust.freshness === 'unknown') return { allowed: false, reason: 'gateway_snapshot_unavailable' };
  if (trust.freshness === 'stale') return { allowed: false, reason: 'gateway_snapshot_stale' };
  if (!trust.permissionScope.includes(GATEWAY_WRITE_SCOPE)) {
    return { allowed: false, reason: 'permission_denied' };
  }
  return { allowed: true, reason: null };
}

export function decisionGateMessage(reason: DecisionGateReason): string {
  switch (reason) {
    case 'gateway_not_authorized':
      return '当前 Gateway 会话未授权，远程决策已锁定。';
    case 'gateway_not_connected':
      return 'Gateway 未连接，远程决策已锁定。请恢复连接后重试。';
    case 'gateway_snapshot_unavailable':
      return '尚未收到可验证的 Gateway 快照，远程决策已锁定。';
    case 'gateway_snapshot_stale':
      return 'Gateway 数据已陈旧，远程决策已锁定。请刷新后重试。';
    case 'permission_denied':
      return '当前设备没有 Needs You 写入权限，远程决策已锁定。';
  }
}
