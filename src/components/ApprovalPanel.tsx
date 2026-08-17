import type { Agent, Decision, InboxItem } from '../app/types';
import { decisionGateMessage } from '../providers/trust';
import type { DataSource, DecisionGate } from '../providers/types';

interface ApprovalPanelProps {
  item: InboxItem;
  agent: Agent;
  onDecision: (decision: Decision) => void;
  onBack: () => void;
  source: DataSource;
  decisionGate: DecisionGate;
}

export function ApprovalPanel({ item, agent, onDecision, onBack, source, decisionGate }: ApprovalPanelProps) {
  const decided = item.status !== 'pending';
  const decisionBlocked = !decided && !decisionGate.allowed;
  const decisionSuffix = source === 'fixture' ? '（模拟）' : '（Gateway）';
  const decisionLabels = {
    approved: `已批准${decisionSuffix}`,
    rejected: `已拒绝${decisionSuffix}`,
    deferred: `已稍后处理${decisionSuffix}`,
  } as const;
  return (
    <section className="approval-panel" aria-labelledby="approval-heading">
      <button type="button" className="back-button" onClick={onBack}>‹ 返回 Needs You</button>
      <div className="approval-panel__header">
        <div>
          <p className="eyebrow">{agent.displayName} · {item.kind === 'approval' ? 'Approval' : 'Agent Inbox'}</p>
          <h1 id="approval-heading">{item.title}</h1>
        </div>
        <span className={`risk-label risk-label--${item.risk}`}>{item.risk === 'high' ? '高风险' : item.risk === 'medium' ? '需复核' : '低风险'}</span>
      </div>
      <p className="approval-panel__detail">{item.detail}</p>
      {agent.id === 'deepseek-harness' && <p className="preview-callout">dsh 开发者预览 · 当前仅为本地模拟状态</p>}
      {decided ? (
        <div className="decision-result" role="status">{decisionLabels[item.status as keyof typeof decisionLabels]}</div>
      ) : (
        <div className="approval-actions" aria-label="审批操作">
          <button type="button" className="action-button action-button--approve" disabled={decisionBlocked} onClick={() => onDecision('approve')}>批准</button>
          <button type="button" className="action-button action-button--reject" disabled={decisionBlocked} onClick={() => onDecision('reject')}>拒绝</button>
          <button type="button" className="action-button action-button--quiet" disabled={decisionBlocked} onClick={() => onDecision('defer')}>稍后</button>
        </div>
      )}
      {decisionBlocked && decisionGate.reason && (
        <p className="decision-gate-message" role="status">{decisionGateMessage(decisionGate.reason)}</p>
      )}
    </section>
  );
}
