import type {
  AhtProvider,
  CommandAck,
  DecisionCommand,
  DecisionLifecycle,
  ProviderAuthorization,
  ProviderEvent,
} from '../types';
import { applyGatewayEventMessage, toFixtureState } from './reducer';
import {
  createUnknownGatewaySnapshotTrust,
  deriveGatewaySnapshotTrust,
  getDecisionGate,
  markSnapshotTrustStale,
} from '../trust';
import type { ConnectionState, SnapshotTrust } from '../types';
import {
  gatewayProtocol,
  parseGatewayServerMessage,
  type GatewayAuth,
  type GatewayClientKind,
  type GatewayCommandMessage,
  type GatewayHelloMessage,
  type GatewaySnapshot,
} from '../protocol';

export interface WebSocketLike {
  readyState: number;
  send(message: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
}

export interface GatewayProviderOptions {
  url: string;
  clientId?: string;
  deviceId?: string;
  clientKind?: GatewayClientKind;
  auth?: GatewayAuth;
  socketFactory?: (url: string) => WebSocketLike;
  reconnectDelaysMs?: number[];
  nowFn?: () => number;
  maxSnapshotAgeMs?: number;
  setTimeoutFn?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (timer: ReturnType<typeof setTimeout>) => void;
}

interface PendingCommand {
  command: DecisionCommand;
  resolve: (ack: CommandAck) => void;
  acknowledged: boolean;
}

const defaultSocketFactory = (url: string): WebSocketLike => new WebSocket(url) as unknown as WebSocketLike;

export class GatewayProvider implements AhtProvider {
  readonly source = 'gateway' as const;
  private readonly url: string;
  private readonly clientId: string;
  private readonly deviceId: string;
  private readonly clientKind: GatewayClientKind;
  private readonly auth: GatewayAuth;
  private readonly socketFactory: (url: string) => WebSocketLike;
  private readonly reconnectDelaysMs: number[];
  private readonly nowFn: () => number;
  private readonly maxSnapshotAgeMs: number;
  private readonly setTimeoutFn: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  private readonly clearTimeoutFn: (timer: ReturnType<typeof setTimeout>) => void;
  private readonly listeners = new Set<(event: ProviderEvent) => void>();
  private readonly pendingCommands = new Map<string, PendingCommand>();
  private socket: WebSocketLike | null = null;
  private gatewaySnapshot: GatewaySnapshot | null = null;
  private lastEventId: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private commandSequence = 0;
  private messageSequence = 0;
  private manuallyDisconnected = false;
  private connectionState: ConnectionState = 'idle';
  private snapshotTrust: SnapshotTrust = createUnknownGatewaySnapshotTrust();
  private authorization: ProviderAuthorization;
  private seenMessageIds = new Set<string>();

  constructor(options: GatewayProviderOptions) {
    this.url = options.url;
    this.clientId = options.clientId ?? 'aht-browser';
    this.deviceId = options.deviceId ?? 'aht-device';
    this.clientKind = options.clientKind ?? 'browser';
    this.auth = options.auth ?? { mode: 'reference', credential_ref: 'reference:aht' };
    this.socketFactory = options.socketFactory ?? defaultSocketFactory;
    this.reconnectDelaysMs = options.reconnectDelaysMs ?? [250, 500, 1000, 2000, 5000];
    this.nowFn = options.nowFn ?? (() => Date.now());
    this.maxSnapshotAgeMs = options.maxSnapshotAgeMs ?? 30_000;
    this.setTimeoutFn = options.setTimeoutFn ?? ((callback, delay) => setTimeout(callback, delay));
    this.clearTimeoutFn = options.clearTimeoutFn ?? ((timer) => clearTimeout(timer));
    this.authorization = {
      status: 'unauthorized',
      sessionId: null,
      principalId: null,
      tenantId: null,
      deviceId: this.deviceId,
      permissionScope: [],
      reason: null,
    };
  }

  subscribe(listener: (event: ProviderEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  connect(): void {
    this.manuallyDisconnected = false;
    if (this.socket && (this.socket.readyState === 0 || this.socket.readyState === 1)) return;
    this.openSocket();
  }

  disconnect(): void {
    this.manuallyDisconnected = true;
    if (this.reconnectTimer) {
      this.clearTimeoutFn(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.pendingCommands.forEach((pending, commandId) => {
      if (pending.acknowledged) {
        this.emitLifecycle({
          commandId,
          itemId: pending.command.itemId,
          phase: 'result_pending',
          reason: 'client_stopped',
          sourceEventId: this.lastEventId,
          finalEventId: null,
        });
      } else {
        pending.resolve(this.rejectedAck(commandId, 'gateway_disconnected', true));
        this.emitLifecycle({
          commandId,
          itemId: pending.command.itemId,
          phase: 'failed',
          reason: 'gateway_disconnected',
          sourceEventId: this.lastEventId,
          finalEventId: null,
        });
        this.pendingCommands.delete(commandId);
      }
    });
    this.emitConnection('disconnected', 'client_stopped');
  }

  decide(command: DecisionCommand): Promise<CommandAck> {
    const commandId = `${this.clientId}-${String(++this.commandSequence).padStart(4, '0')}`;
    this.refreshSnapshotTrustForDecision();
    const gate = getDecisionGate('gateway', this.connectionState, this.snapshotTrust);
    if (!gate.allowed) {
      const reason = gate.reason ?? 'gateway_not_connected';
      return Promise.resolve(this.rejectedAck(commandId, reason, reason === 'gateway_snapshot_stale'));
    }
    if (!this.socket || this.socket.readyState !== 1 || !this.gatewaySnapshot || this.authorization.status !== 'authorized') {
      return Promise.resolve(this.rejectedAck(commandId, 'gateway_not_connected', true));
    }

    const target = this.gatewaySnapshot.needs_you.find((item) => item.id === command.itemId);
    if (!target || target.agent_id !== command.agentId) {
      return Promise.resolve(this.rejectedAck(commandId, 'invalid_target', false));
    }
    if (target.status !== 'pending') {
      return Promise.resolve(this.rejectedAck(commandId, 'policy_denied', false));
    }
    if (!target.actions.includes(command.decision)) {
      return Promise.resolve(this.rejectedAck(commandId, 'action_not_allowed', false));
    }

    const message: GatewayCommandMessage = {
      protocol: gatewayProtocol,
      type: 'command',
      message_id: this.nextMessageId('command'),
      command_id: commandId,
      command: command.decision,
      target: { needs_you_id: command.itemId, agent_id: command.agentId },
      precondition: { event_id: this.gatewaySnapshot.event_id, revision: this.gatewaySnapshot.revision },
    };

    this.emitLifecycle({
      commandId,
      itemId: command.itemId,
      phase: 'sending',
      reason: null,
      sourceEventId: this.gatewaySnapshot.event_id,
      finalEventId: null,
    });
    return new Promise((resolve) => {
      this.pendingCommands.set(commandId, { command, resolve, acknowledged: false });
      try {
        this.socket?.send(JSON.stringify(message));
      } catch {
        this.pendingCommands.delete(commandId);
        resolve(this.rejectedAck(commandId, 'send_failed', true));
        this.emitLifecycle({
          commandId,
          itemId: command.itemId,
          phase: 'failed',
          reason: 'send_failed',
          sourceEventId: this.lastEventId,
          finalEventId: null,
        });
      }
    });
  }

  private openSocket(): void {
    if (!this.url) {
      this.emitConnection('error', 'gateway_url_missing');
      this.emit({ type: 'error', code: 'gateway_url_missing', message: 'Gateway 地址未配置', retryable: false });
      return;
    }
    this.emitConnection(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
    try {
      const socket = this.socketFactory(this.url);
      this.socket = socket;
      this.seenMessageIds = new Set<string>();
      socket.onopen = () => this.handleOpen();
      socket.onmessage = (event) => this.handleMessage(event.data);
      socket.onerror = () => this.handleSocketError();
      socket.onclose = () => this.handleClose();
    } catch {
      this.markTransportUnavailable('gateway_unavailable', 'Gateway WebSocket 无法建立');
      this.scheduleReconnect();
    }
  }

  private handleOpen(): void {
    this.sendHello();
  }

  private handleSocketError(): void {
    this.markTransportUnavailable('gateway_socket_error', 'Gateway WebSocket 出现错误');
  }

  private handleMessage(data: unknown): void {
    let input: unknown;
    try {
      input = typeof data === 'string' ? JSON.parse(data) : data;
    } catch {
      this.markTransportUnavailable('invalid_json', 'Gateway 返回了非法 JSON', false);
      return;
    }

    const message = parseGatewayServerMessage(input);
    if (message.type === 'protocol_error') {
      this.snapshotTrust = markSnapshotTrustStale(this.snapshotTrust, 'gateway_protocol_error');
      this.emit({ type: 'error', code: message.code, message: message.message, retryable: false });
      return;
    }
    if (this.seenMessageIds.has(message.message_id)) {
      this.emit({ type: 'error', code: 'duplicate_message', message: 'Gateway message_id 重复', retryable: false });
      return;
    }
    this.seenMessageIds.add(message.message_id);

    switch (message.type) {
      case 'hello_ack':
        this.handleHelloAck(message);
        break;
      case 'snapshot':
        this.handleSnapshot(message.snapshot);
        break;
      case 'event':
        this.handleEvent(message);
        break;
      case 'command_ack':
        this.handleCommandAck(message);
        break;
      case 'resync_required':
        this.requestResync(`resync_required:${message.reason}`);
        break;
      case 'error':
        if (message.code === 'unauthorized' || message.code === 'pairing_required') {
          this.emitConnection(message.code === 'pairing_required' ? 'pairing_required' : 'unauthorized', message.message);
        }
        this.snapshotTrust = markSnapshotTrustStale(this.snapshotTrust, message.code);
        this.emit({ type: 'error', code: message.code, message: message.message, retryable: message.retryable });
        break;
      case 'pairing_challenge':
      case 'pairing_result':
      case 'pong':
        break;
    }
  }

  private handleHelloAck(message: Extract<ReturnType<typeof parseGatewayServerMessage>, { type: 'hello_ack' }>): void {
    const authorization = message.authorization;
    this.authorization = {
      status: authorization.status,
      sessionId: message.session.id,
      principalId: message.session.principal_id,
      tenantId: message.session.tenant_id,
      deviceId: message.session.device_id,
      permissionScope: [...authorization.permission_scope],
      reason: authorization.reason,
    };
    this.emit({ type: 'authorization', authorization: this.authorization });
    if (message.session.device_id !== this.deviceId) {
      this.emitConnection('unauthorized', 'device_mismatch');
      this.emit({ type: 'error', code: 'unauthorized', message: 'Gateway 会话设备不匹配', retryable: false });
      return;
    }
    if (authorization.status === 'authorized') {
      this.reconnectAttempt = 0;
      this.emitConnection('connected');
      return;
    }
    this.gatewaySnapshot = null;
    this.snapshotTrust = createUnknownGatewaySnapshotTrust(authorization.reason ?? authorization.status);
    this.emitConnection(authorization.status === 'pairing_required' ? 'pairing_required' : 'unauthorized', authorization.reason ?? undefined);
    this.emit({
      type: 'error',
      code: authorization.status,
      message: authorization.reason ?? (authorization.status === 'pairing_required' ? 'Gateway 需要完成设备配对' : 'Gateway 会话未授权'),
      retryable: false,
    });
  }

  private handleSnapshot(snapshot: GatewaySnapshot): void {
    if (this.authorization.status !== 'authorized') {
      this.emit({ type: 'error', code: 'unauthorized', message: '未授权会话不能接收业务快照', retryable: false });
      return;
    }
    if (snapshot.device_id !== this.deviceId
      || snapshot.tenant_id !== this.authorization.tenantId
      || snapshot.principal_id !== this.authorization.principalId) {
      this.markTransportUnavailable('invalid_snapshot', 'Gateway 快照身份上下文不匹配', false);
      return;
    }
    this.gatewaySnapshot = this.withEffectiveScope(snapshot);
    this.lastEventId = snapshot.event_id;
    const snapshotReceivedAt = this.nowFn();
    this.snapshotTrust = deriveGatewaySnapshotTrust(
      this.gatewaySnapshot,
      snapshotReceivedAt,
      snapshotReceivedAt,
      this.maxSnapshotAgeMs,
    );
    this.emitSnapshot();
  }

  private handleEvent(message: Extract<ReturnType<typeof parseGatewayServerMessage>, { type: 'event' }>): void {
    if (this.authorization.status !== 'authorized') {
      this.emit({ type: 'error', code: 'unauthorized', message: '未授权会话不能接收业务事件', retryable: false });
      return;
    }
    if (!this.gatewaySnapshot) {
      this.emit({ type: 'error', code: 'resync_required', message: 'Gateway event 尚未有 snapshot 基线', retryable: true });
      this.requestResync('snapshot_required');
      return;
    }
    const result = applyGatewayEventMessage(this.gatewaySnapshot, message);
    if (result.status !== 'applied') {
      this.snapshotTrust = markSnapshotTrustStale(this.snapshotTrust, result.reason ?? result.status);
      this.emit({
        type: 'error',
        code: result.status === 'invalid_event' ? 'invalid_event' : 'resync_required',
        message: result.reason ?? 'Gateway event 无法应用',
        retryable: result.status === 'resync_required',
      });
      if (result.status === 'resync_required') this.requestResync(result.reason ?? 'event_invalid');
      return;
    }
    this.gatewaySnapshot = this.withEffectiveScope(result.snapshot);
    this.lastEventId = message.event_id;
    const receivedAt = this.nowFn();
    this.snapshotTrust = deriveGatewaySnapshotTrust(
      this.gatewaySnapshot,
      receivedAt,
      receivedAt,
      this.maxSnapshotAgeMs,
    );
    this.emitSnapshot();

    if (message.event.type === 'needs_you_resolved' && message.event.command_id) {
      const pending = this.pendingCommands.get(message.event.command_id);
      if (pending) {
        this.emitLifecycle({
          commandId: message.event.command_id,
          itemId: pending.command.itemId,
          phase: 'confirmed',
          reason: null,
          sourceEventId: message.event_id,
          finalEventId: message.event_id,
        });
        this.pendingCommands.delete(message.event.command_id);
      }
    }
  }

  private handleCommandAck(message: Extract<ReturnType<typeof parseGatewayServerMessage>, { type: 'command_ack' }>): void {
    const ack: CommandAck = {
      commandId: message.command_id,
      status: message.status,
      phase: message.phase,
      reason: message.reason,
      finalEventId: message.final_event_id,
      retryable: message.retryable,
    };
    const pending = this.pendingCommands.get(message.command_id);
    if (pending) {
      if (!pending.acknowledged) {
        pending.acknowledged = true;
        pending.resolve(ack);
      }
      if (message.status === 'rejected') {
        this.pendingCommands.delete(message.command_id);
        this.emitLifecycle({
          commandId: message.command_id,
          itemId: pending.command.itemId,
          phase: 'rejected',
          reason: message.reason,
          sourceEventId: this.lastEventId,
          finalEventId: message.final_event_id,
        });
      } else if (message.status === 'accepted' && message.phase === 'pending_event') {
        this.emitLifecycle({
          commandId: message.command_id,
          itemId: pending.command.itemId,
          phase: 'gateway_accepted',
          reason: null,
          sourceEventId: this.lastEventId,
          finalEventId: null,
        });
        this.emitLifecycle({
          commandId: message.command_id,
          itemId: pending.command.itemId,
          phase: 'waiting_final_event',
          reason: null,
          sourceEventId: this.lastEventId,
          finalEventId: null,
        });
      } else if (message.status === 'duplicate' && message.phase === 'final') {
        this.emitLifecycle({
          commandId: message.command_id,
          itemId: pending.command.itemId,
          phase: 'confirmed',
          reason: null,
          sourceEventId: this.lastEventId,
          finalEventId: message.final_event_id,
        });
        this.pendingCommands.delete(message.command_id);
      }
    }
    this.emit({ type: 'command_ack', ack });
  }

  private sendHello(): void {
    if (!this.socket || this.socket.readyState !== 1) return;
    const hello: GatewayHelloMessage = {
      protocol: gatewayProtocol,
      type: 'hello',
      message_id: this.nextMessageId('hello'),
      client_id: this.clientId,
      device_id: this.deviceId,
      client_kind: this.clientKind,
      auth: this.auth,
      ...(this.lastEventId ? { resume_after: this.lastEventId } : {}),
    };
    try {
      this.socket.send(JSON.stringify(hello));
    } catch {
      this.markTransportUnavailable('hello_send_failed', 'Gateway hello 发送失败');
    }
  }

  private handleClose(): void {
    this.socket = null;
    if (this.manuallyDisconnected) return;
    this.pendingCommands.forEach((pending, commandId) => {
      if (pending.acknowledged) {
        this.emitLifecycle({
          commandId,
          itemId: pending.command.itemId,
          phase: 'result_pending',
          reason: 'gateway_closed',
          sourceEventId: this.lastEventId,
          finalEventId: null,
        });
      } else {
        pending.resolve(this.rejectedAck(commandId, 'gateway_closed', true));
        this.emitLifecycle({
          commandId,
          itemId: pending.command.itemId,
          phase: 'failed',
          reason: 'gateway_closed',
          sourceEventId: this.lastEventId,
          finalEventId: null,
        });
        this.pendingCommands.delete(commandId);
      }
    });
    this.snapshotTrust = markSnapshotTrustStale(this.snapshotTrust, 'gateway_closed');
    this.emitConnection('reconnecting', 'gateway_closed');
    this.scheduleReconnect();
  }

  private requestResync(reason: string): void {
    this.lastEventId = null;
    this.snapshotTrust = markSnapshotTrustStale(this.snapshotTrust, reason);
    this.emitConnection('reconnecting', reason);
    this.sendHello();
  }

  private scheduleReconnect(): void {
    if (this.manuallyDisconnected || this.reconnectTimer || this.reconnectDelaysMs.length === 0) return;
    const delayIndex = Math.min(this.reconnectAttempt, this.reconnectDelaysMs.length - 1);
    const delay = this.reconnectDelaysMs[delayIndex] ?? 5000;
    this.reconnectAttempt += 1;
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = null;
      if (!this.manuallyDisconnected) this.openSocket();
    }, delay);
  }

  private withEffectiveScope(snapshot: GatewaySnapshot): GatewaySnapshot {
    const sessionScope = new Set(this.authorization.permissionScope);
    return {
      ...snapshot,
      permission_scope: snapshot.permission_scope.filter((scope) => sessionScope.has(scope)),
    };
  }

  private refreshSnapshotTrustForDecision(): void {
    if (!this.gatewaySnapshot || this.snapshotTrust.freshness !== 'fresh') return;
    const receivedAtMs = this.snapshotTrust.receivedAt ? Date.parse(this.snapshotTrust.receivedAt) : Number.NaN;
    if (!Number.isFinite(receivedAtMs)) return;
    this.snapshotTrust = deriveGatewaySnapshotTrust(
      this.gatewaySnapshot,
      receivedAtMs,
      this.nowFn(),
      this.maxSnapshotAgeMs,
    );
    if (this.snapshotTrust.freshness !== 'fresh') this.emitSnapshot();
  }

  private markTransportUnavailable(code: string, message: string, retryable = true): void {
    this.snapshotTrust = markSnapshotTrustStale(this.snapshotTrust, code);
    this.emitConnection('error', code);
    this.emit({ type: 'error', code, message, retryable });
  }

  private rejectedAck(commandId: string, reason: string, retryable: boolean): CommandAck {
    return {
      commandId,
      status: 'rejected',
      phase: 'not_applicable',
      reason,
      finalEventId: null,
      retryable,
    };
  }

  private nextMessageId(kind: string): string {
    this.messageSequence += 1;
    return `${this.clientId}-${kind}-${String(this.messageSequence).padStart(6, '0')}`;
  }

  private emitLifecycle(lifecycle: DecisionLifecycle): void {
    this.emit({ type: 'command_lifecycle', lifecycle });
  }

  private emit(event: ProviderEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }

  private emitConnection(state: ConnectionState, reason?: string): void {
    this.connectionState = state;
    this.emit({ type: 'connection', state, ...(reason ? { reason } : {}) });
  }

  private emitSnapshot(): void {
    if (!this.gatewaySnapshot) return;
    this.emit({
      type: 'snapshot',
      snapshot: toFixtureState(this.gatewaySnapshot),
      snapshotTrust: this.snapshotTrust,
      eventId: this.lastEventId ?? undefined,
      stale: this.snapshotTrust.freshness !== 'fresh',
    });
  }
}
