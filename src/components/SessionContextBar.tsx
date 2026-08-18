import type { ConnectionState, DataSource, ProviderAuthorization, SnapshotTrust } from '../providers/types';

interface SessionContextBarProps {
  source: DataSource;
  connection: ConnectionState;
  authorization: ProviderAuthorization;
  snapshotTrust: SnapshotTrust;
}

const UNAUTHORIZED_REASON_LABELS: Record<string, string> = {
  credential_revoked: '凭证已吊销',
  session_expired: '会话已过期',
  device_mismatch: '设备不匹配',
  credential_invalid: '凭证无效',
  credential_missing: '缺少凭证',
  tenant_missing: '缺少租户',
  principal_missing: '缺少主体',
};

function formatIso(value: string | null): string {
  return value ? value.replace(/\.\d{3}Z$/, 'Z') : '—';
}

function freshLabel(freshness: SnapshotTrust['freshness'], staleReason: string | null): string {
  if (freshness === 'fresh') return '新鲜';
  if (freshness === 'stale') return `陈旧（${staleReason ?? 'snapshot_expired'}）`;
  return '未知';
}

export function SessionContextBar({ source, connection, authorization, snapshotTrust }: SessionContextBarProps) {
  let content: React.ReactNode;

  if (source === 'fixture') {
    content = <span>本地模拟数据 · 无 Gateway 会话</span>;
  } else if (authorization.status === 'authorized' && authorization.tenantId && authorization.principalId) {
    const scope = authorization.permissionScope.length > 0 ? authorization.permissionScope.join(' ') : '无';
    content = (
      <>
        <span>会话 {authorization.sessionId ?? '—'}</span>
        <span>租户 {authorization.tenantId}</span>
        <span>主体 {authorization.principalId}</span>
        <span>设备 {authorization.deviceId}</span>
        <span>权限 {scope}</span>
        <span>过期 {authorization.expiresAt ? formatIso(authorization.expiresAt) : '长期有效'}</span>
        <span>
          快照 {snapshotTrust.eventId ?? '—'} r{snapshotTrust.revision ?? '—'} ·
          {freshLabel(snapshotTrust.freshness, snapshotTrust.staleReason)} ·
          生成 {formatIso(snapshotTrust.generatedAt)}
        </span>
      </>
    );
  } else if (authorization.status === 'authorized') {
    content = <span>会话上下文不完整 · 决策已锁定</span>;
  } else if (authorization.status === 'pairing_required') {
    content = <span>需要配对 · 尚未注册此设备（租户/主体缺失）</span>;
  } else if (authorization.status === 'unauthorized') {
    const label = UNAUTHORIZED_REASON_LABELS[authorization.reason ?? ''] ?? authorization.reason ?? '未授权';
    content = <span>未授权 · {label} · 决策已锁定</span>;
  } else if (connection === 'connecting' || connection === 'reconnecting') {
    content = <span>正在连接 Gateway · 会话信息待确认</span>;
  } else if (connection === 'disconnected') {
    content = <span>Gateway 已断开 · 保留上一份可验证快照</span>;
  } else {
    content = <span>Gateway 状态待确认</span>;
  }

  return (
    <div
      className="session-context-bar"
      data-testid="session-context-bar"
      role="status"
      aria-label="会话与数据可信状态"
    >
      {content}
    </div>
  );
}
