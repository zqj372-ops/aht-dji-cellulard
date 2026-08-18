import type { DataSource, SnapshotTrust } from '../providers/types';

interface ScreenSourceNoteProps {
  source: DataSource;
  snapshotTrust: SnapshotTrust;
  readOnlyLabel: string;
}

function freshnessLabel(trust: SnapshotTrust): string {
  if (trust.freshness === 'fresh') return '新鲜';
  if (trust.freshness === 'stale') return `陈旧（${trust.staleReason ?? 'snapshot_expired'}）`;
  return '未知';
}

export function ScreenSourceNote({ source, snapshotTrust, readOnlyLabel }: ScreenSourceNoteProps) {
  if (source === 'fixture') {
    return (
      <p className="screen-source-note" data-testid="screen-source-note" role="note">
        本地模拟数据 · {readOnlyLabel} · 无 Gateway 会话
      </p>
    );
  }
  return (
    <p className="screen-source-note" data-testid="screen-source-note" role="note">
      Gateway authority 数据 · {readOnlyLabel} · 快照 {snapshotTrust.eventId ?? '—'} r{snapshotTrust.revision ?? '—'} ·{' '}
      {freshnessLabel(snapshotTrust)} · 生成 {snapshotTrust.generatedAt?.replace(/\.\d{3}Z$/, 'Z') ?? '—'}
    </p>
  );
}
