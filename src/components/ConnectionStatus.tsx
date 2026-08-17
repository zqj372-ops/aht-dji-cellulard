import type { ConnectionState, DataSource } from '../providers/types';

interface ConnectionStatusProps {
  source: DataSource;
  connection: ConnectionState;
  stale: boolean;
  error: string | null;
}

function getLabel({ source, connection, stale, error }: ConnectionStatusProps): string {
  if (source === 'fixture') return 'Fixture · 本地';
  if (connection === 'connected' && !stale) return 'Gateway · 已连接';
  if (connection === 'connected' && stale) return 'Gateway · 已连接（陈旧）';
  if (connection === 'connecting') return 'Gateway · 正在连接';
  if (connection === 'reconnecting') return 'Gateway · 重连中';
  if (connection === 'disconnected') return 'Gateway · 已断开';
  if (error) return 'Gateway · 不可用';
  return 'Gateway · 等待数据';
}

export function ConnectionStatus(props: ConnectionStatusProps) {
  return (
    <span className={`connection-status connection-status--${props.connection}`} role="status" aria-label="数据源状态">
      {getLabel(props)}
    </span>
  );
}
