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

const riskLabels: Record<InboxItem['risk'], string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

function getInboxSummary(item: InboxItem, agent: Agent): string {
  if (agent.id === 'deepseek-harness') return 'dsh 开发者预览 · 插件状态待确认';
  if (agent.id === 'claude-code') return '代码审查完成 · 等待你的合并决策';
  if (agent.id === 'openclaw') return '研究任务已完成 · 可查看摘要';
  if (item.kind === 'approval') return `${item.title} · ${riskLabels[item.risk]}`;
  return `${item.title} · ${kindLabels[item.kind]}`;
}

export function InboxCard({ item, agent, onOpen }: InboxCardProps) {
  return (
    <button
      type="button"
      className={`inbox-card inbox-card--${item.kind}`}
      data-testid="inbox-card"
      aria-label={`${agent.displayName}：${item.title}`}
      onClick={() => onOpen(item.id)}
    >
      <AgentIcon src={agent.icon} alt={`${agent.displayName} 图标`} />
      <span className="inbox-card__copy">
        <strong>{agent.displayName}</strong>
        <span className="inbox-card__summary">{getInboxSummary(item, agent)}</span>
      </span>
      <span className="inbox-card__time">{item.timeLabel}</span>
      <span className="inbox-card__arrow" aria-hidden="true">›</span>
    </button>
  );
}
