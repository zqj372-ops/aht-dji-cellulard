import type { Agent, InboxItem, InboxKind } from '../app/types';
import { AgentIcon } from './AgentIcon';

interface InboxCardProps {
  item: InboxItem;
  agent: Agent;
  onOpen: (itemId: string) => void;
}

const kindLabels: Record<InboxKind, string> = {
  approval: '需要确认',
  question: '需要回答',
  completed: '已完成',
  error: '需要复核',
  security: '安全确认',
  server_alert: '服务器告警',
};

export function InboxCard({ item, agent, onOpen }: InboxCardProps) {
  return (
    <button
      type="button"
      className={`inbox-card inbox-card--${item.kind}`}
      aria-label={`${agent.displayName}：${item.title}`}
      onClick={() => onOpen(item.id)}
    >
      <AgentIcon src={agent.icon} alt={`${agent.displayName} 图标`} />
      <span className="inbox-card__copy">
        <strong>{agent.displayName}</strong>
        <span className="inbox-card__title">{item.title}</span>
        {agent.id === 'deepseek-harness' && <span className="inbox-card__preview">dsh 开发者预览</span>}
        <span className="inbox-card__kind">{kindLabels[item.kind]}</span>
      </span>
      <span className="inbox-card__time">{item.timeLabel}</span>
      <span className="inbox-card__arrow" aria-hidden="true">›</span>
    </button>
  );
}
