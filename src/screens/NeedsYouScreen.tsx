import type { Agent, InboxItem } from '../app/types';
import { InboxCard } from '../components/InboxCard';
import { ScreenSourceNote } from '../components/ScreenSourceNote';
import type { DataSource, SnapshotTrust } from '../providers/types';

interface NeedsYouScreenProps {
  inbox: InboxItem[];
  agents: Agent[];
  source: DataSource;
  snapshotTrust: SnapshotTrust;
  onOpen: (itemId: string) => void;
}

export function NeedsYouScreen({ inbox, agents, source, snapshotTrust, onOpen }: NeedsYouScreenProps) {
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  return (
    <section aria-labelledby="needs-heading">
      <div className="screen-heading screen-heading--compact">
        <div>
          <h1 id="needs-heading">Agent Inbox</h1>
          <p>统一聚合 Approval、Question、Completed 和 Error</p>
        </div>
        <strong>{inbox.filter((item) => item.status === 'pending').length}</strong>
      </div>
      <ScreenSourceNote source={source} snapshotTrust={snapshotTrust} readOnlyLabel="只读事项列表，操作在详情页" />
      <div className="inbox-list" aria-label="Agent Inbox 列表">
        {inbox.map((item) => {
          const agent = agentById.get(item.agentId);
          return agent ? <InboxCard key={item.id} item={item} agent={agent} onOpen={onOpen} /> : null;
        })}
      </div>
    </section>
  );
}
