import type { AgentCapabilitySet, FixtureState, InboxItem, ServerSnapshot } from '../../app/types';
import { emptyState } from '../emptyState';
import { resolveAgentIcon } from '../fixture/fixtureState';
import type { GatewayAgent, GatewayEvent, GatewayServer, GatewaySnapshot } from '../protocol';

const defaultCapabilities: AgentCapabilitySet = {
  prompt: true,
  sessions: true,
  approval: true,
  stop: true,
  steer: true,
  tasks: true,
  artifacts: true,
  modelSwitch: false,
  usage: true,
  terminal: true,
};

function toServerStatus(server: GatewayServer): ServerSnapshot['status'] {
  return server.online ? 'online' : 'offline';
}

function toServiceStatus(server: GatewayServer, key: string): 'online' | 'offline' {
  const state = server.services[key];
  return state === 'healthy' ? 'online' : 'offline';
}

function toAgent(agent: GatewayAgent): FixtureState['agents'][number] {
  return {
    id: agent.id,
    type: agent.type,
    displayName: agent.name,
    shortName: agent.type,
    model: agent.model,
    server: agent.server,
    workspace: agent.workspace,
    session: agent.session,
    icon: resolveAgentIcon(agent.type),
    status: agent.status,
    availability: agent.maturity,
    project: agent.workspace ?? 'Gateway',
    summary: agent.current_task ?? '无当前任务',
    currentTask: agent.current_task,
    elapsed: agent.elapsed_seconds,
    needsUser: agent.needs_user,
    capabilities: { ...defaultCapabilities, ...agent.capabilities },
  };
}

function toInboxItem(item: GatewaySnapshot['needs_you'][number]): InboxItem {
  return {
    id: item.id,
    agentId: item.agent_id,
    kind: item.type,
    title: item.title,
    detail: item.detail,
    risk: item.risk,
    timeLabel: item.status === 'pending' ? 'Gateway' : '已处理',
    status: item.status,
    actions: item.actions,
    createdAt: item.created_at,
  };
}

function toServer(server: GatewayServer): ServerSnapshot {
  return {
    id: server.id,
    displayName: server.name,
    status: toServerStatus(server),
    rtt: server.rtt_ms ?? 0,
    cpu: server.cpu_percent ?? 0,
    ram: server.memory_percent ?? 0,
    disk: server.disk_percent ?? 0,
    load: server.load ?? 0,
    dockerRunning: 0,
    dockerRestarting: 0,
    gateway: toServiceStatus(server, 'gateway'),
    tailscale: toServiceStatus(server, 'tailscale'),
    ssh: toServiceStatus(server, 'ssh'),
    dataSource: 'gateway',
  };
}

export function toFixtureState(snapshot: GatewaySnapshot): FixtureState {
  return {
    ...emptyState,
    agents: snapshot.agents.map(toAgent),
    inbox: snapshot.needs_you.map(toInboxItem),
    servers: snapshot.servers.map(toServer),
    network: snapshot.network ? {
      link: snapshot.network.link,
      rtt: snapshot.network.rtt_ms ?? 0,
      vpn: snapshot.network.vpn,
      signal: snapshot.network.link === 'offline' ? 0 : 4,
    } : emptyState.network,
  };
}

function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
  const index = items.findIndex((item) => item.id === next.id);
  if (index < 0) return [...items, next];
  return items.map((item, itemIndex) => itemIndex === index ? next : item);
}

export function applyGatewayEvent(snapshot: GatewaySnapshot, event: GatewayEvent): GatewaySnapshot {
  const nextSnapshot = { ...snapshot, revision: snapshot.revision + 1 };
  switch (event.type) {
    case 'needs_you_created':
      return { ...nextSnapshot, needs_you: upsertById(snapshot.needs_you, event.item) };
    case 'needs_you_resolved':
      return {
        ...nextSnapshot,
        needs_you: snapshot.needs_you.map((item) => item.id === event.needs_you_id
          ? { ...item, status: event.status }
          : item),
      };
    case 'agent_updated':
      return { ...nextSnapshot, agents: upsertById(snapshot.agents, event.agent) };
    case 'server_updated':
      return { ...nextSnapshot, servers: upsertById(snapshot.servers, event.server) };
  }
}
