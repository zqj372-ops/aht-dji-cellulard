import type { AgentCapabilitySet, FixtureState, InboxItem, ServerSnapshot } from '../../app/types';
import { emptyState } from '../emptyState';
import { resolveAgentIcon } from '../fixture/fixtureState';
import type {
  GatewayAgent,
  GatewayEvent,
  GatewayEventMessage,
  GatewayServer,
  GatewaySnapshot,
} from '../protocol';

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

function applyEventProjection(snapshot: GatewaySnapshot, event: GatewayEvent): GatewaySnapshot {
  switch (event.type) {
    case 'needs_you_created':
      return { ...snapshot, needs_you: upsertById(snapshot.needs_you, event.item) };
    case 'needs_you_updated':
      return { ...snapshot, needs_you: upsertById(snapshot.needs_you, event.item) };
    case 'needs_you_resolved':
      return {
        ...snapshot,
        needs_you: snapshot.needs_you.map((item) => item.id === event.needs_you_id
          ? { ...item, status: event.status }
          : item),
      };
    case 'agent_updated':
      return { ...snapshot, agents: upsertById(snapshot.agents, event.agent) };
    case 'session_updated':
      return { ...snapshot, sessions: upsertById(snapshot.sessions, event.session) };
    case 'server_updated':
      return { ...snapshot, servers: upsertById(snapshot.servers, event.server) };
    case 'permission_updated':
      return { ...snapshot, permission_scope: [...event.permission_scope] };
  }
}

export interface GatewayEventApplyResult {
  status: 'applied' | 'resync_required' | 'invalid_event';
  snapshot: GatewaySnapshot;
  reason: string | null;
}

export function applyGatewayEvent(snapshot: GatewaySnapshot, event: GatewayEvent): GatewaySnapshot {
  return {
    ...applyEventProjection(snapshot, event),
    revision: snapshot.revision + 1,
  };
}

export function applyGatewayEventMessage(
  snapshot: GatewaySnapshot,
  message: GatewayEventMessage,
): GatewayEventApplyResult {
  if (message.revision <= snapshot.revision) {
    return { status: 'resync_required', snapshot, reason: 'event_revision_replayed' };
  }
  if (message.revision !== snapshot.revision + 1) {
    return { status: 'resync_required', snapshot, reason: 'event_revision_gap' };
  }
  if (message.event_id === snapshot.event_id) {
    return { status: 'resync_required', snapshot, reason: 'event_id_reused' };
  }
  if (message.audit.tenant_id !== snapshot.tenant_id
    || message.audit.principal_id !== snapshot.principal_id
    || message.audit.device_id !== snapshot.device_id) {
    return { status: 'invalid_event', snapshot, reason: 'event_authority_mismatch' };
  }
  if (message.audit.source_event_id !== null && message.audit.source_event_id !== snapshot.event_id) {
    return { status: 'invalid_event', snapshot, reason: 'event_source_mismatch' };
  }
  if (message.audit.source_revision !== null && message.audit.source_revision !== snapshot.revision) {
    return { status: 'invalid_event', snapshot, reason: 'event_source_revision_mismatch' };
  }
  const resolvedTargetId = message.event.type === 'needs_you_resolved' ? message.event.needs_you_id : null;
  if (resolvedTargetId && !snapshot.needs_you.some((item) => item.id === resolvedTargetId)) {
    return { status: 'invalid_event', snapshot, reason: 'event_target_missing' };
  }

  return {
    status: 'applied',
    snapshot: {
      ...applyEventProjection(snapshot, message.event),
      revision: message.revision,
      event_id: message.event_id,
      generated_at: message.generated_at,
    },
    reason: null,
  };
}
