import type { Agent } from '../app/types';
import { AgentIcon } from '../components/AgentIcon';

interface AgentsScreenProps { agents: Agent[]; }

const statusLabels: Record<Agent['status'], string> = {
  idle: '空闲', running: '运行中', waiting_input: '等待输入',
  waiting_approval: '等待批准', completed: '已完成', error: '错误', disconnected: '已断开',
};

export function AgentsScreen({ agents }: AgentsScreenProps) {
  return (
    <section aria-labelledby="agents-heading">
      <div className="screen-heading screen-heading--compact">
        <div><h1 id="agents-heading">Agents</h1><p>统一查看七个 Agent 的状态</p></div>
        <strong>{agents.length}</strong>
      </div>
      <div className="agent-list" aria-label="Agent 列表">
        {agents.map((agent) => (
          <article className="agent-row" key={agent.id}>
            <AgentIcon size="list" src={agent.icon} alt={`${agent.displayName} 图标`} />
            <div className="agent-row__copy"><strong>{agent.displayName}</strong><span>{agent.project} · {agent.summary}</span></div>
            <span className={`status-chip status-chip--${agent.status}`}>{statusLabels[agent.status]}</span>
            {agent.availability === 'developer_preview' && <span className="preview-chip">Developer Preview</span>}
          </article>
        ))}
      </div>
    </section>
  );
}
