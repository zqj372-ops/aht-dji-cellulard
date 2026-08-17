import type { Agent, InboxItem } from '../app/types';
import { InboxCard } from '../components/InboxCard';

interface HomeScreenProps {
  inbox: InboxItem[];
  agents: Agent[];
  onOpen: (itemId: string) => void;
}

export function HomeScreen({ inbox, agents, onOpen }: HomeScreenProps) {
  const pendingItems = inbox.filter((item) => item.status === 'pending');
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  return (
    <section aria-labelledby="home-heading">
      <div className="screen-heading">
        <div>
          <h1 id="home-heading">现在需要你</h1>
          <p>Agent 有 {pendingItems.length} 个事项等待处理</p>
        </div>
        <div><strong>{pendingItems.length}</strong><span className="screen-count-label">待处理</span></div>
      </div>
      <div className="inbox-list" aria-label="待处理 Agent 事项">
        {pendingItems.map((item) => {
          const agent = agentById.get(item.agentId);
          return agent ? <InboxCard key={item.id} item={item} agent={agent} onOpen={onOpen} /> : null;
        })}
      </div>
      {pendingItems.length === 0 && <p className="empty-state">暂时没有需要你处理的事项。</p>}
    </section>
  );
}
