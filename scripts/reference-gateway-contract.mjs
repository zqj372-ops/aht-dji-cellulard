import { createGatewaySnapshot } from './gateway-fixture.mjs';

export const gatewayProtocol = 'aht.gateway.v1';
const referenceCredential = 'reference:aht';
const referenceScope = ['agents:read', 'sessions:read', 'needs_you:read', 'needs_you:write', 'servers:read'];
const errorCodes = new Set([
  'invalid_message', 'invalid_protocol', 'unknown_type', 'invalid_snapshot', 'invalid_event',
  'unauthorized', 'pairing_required', 'permission_denied', 'stale_target', 'invalid_target',
  'action_not_allowed', 'duplicate_command', 'policy_denied', 'resync_required',
  'credential_not_found', 'server_unavailable',
]);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoTimestamp(value) {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isScopeArray(value) {
  return Array.isArray(value)
    && value.every((scope) => typeof scope === 'string' && /^[a-z][a-z0-9_.-]*:[a-z][a-z0-9_.-]*$/.test(scope));
}

function isNonNegativeInteger(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function fingerprint(command) {
  return JSON.stringify({
    command: command.command,
    target: command.target,
    precondition: command.precondition,
  });
}

function decisionStatus(decision) {
  return decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'deferred';
}

function validateClientMessage(message) {
  if (!isRecord(message)) return { code: 'invalid_message', message: 'Gateway message must be an object' };
  if (message.protocol !== gatewayProtocol) return { code: 'invalid_protocol', message: 'Unsupported Gateway protocol' };
  if (!isNonEmptyString(message.type) || !isNonEmptyString(message.message_id)) {
    return { code: 'invalid_message', message: 'Gateway message type and message_id are required' };
  }
  if (message.type === 'hello') {
    if (!isNonEmptyString(message.client_id) || !isNonEmptyString(message.device_id)
      || !['browser', 'native'].includes(message.client_kind)
      || (message.auth !== undefined
        && (!isRecord(message.auth) || !['paired_session', 'pairing_ref', 'reference'].includes(message.auth.mode)
          || !isNonEmptyString(message.auth.credential_ref)))
      || (message.resume_after !== undefined && !isNonEmptyString(message.resume_after))) {
      return { code: 'invalid_message', message: 'Gateway hello is incomplete' };
    }
    return null;
  }
  if (message.type === 'command') {
    if (!isNonEmptyString(message.command_id) || !['approve', 'reject', 'defer'].includes(message.command)
      || !isRecord(message.target) || !isNonEmptyString(message.target.needs_you_id)
      || !isNonEmptyString(message.target.agent_id) || !isRecord(message.precondition)
      || !isNonEmptyString(message.precondition.event_id) || !isNonNegativeInteger(message.precondition.revision)) {
      return { code: 'invalid_message', message: 'Gateway command is incomplete' };
    }
    return null;
  }
  if (message.type === 'pairing_begin') {
    if (!isNonEmptyString(message.client_id) || !isNonEmptyString(message.device_id) || !isNonEmptyString(message.device_name)) {
      return { code: 'invalid_message', message: 'Gateway pairing_begin is incomplete' };
    }
    return null;
  }
  if (message.type === 'pairing_confirm') {
    if (!isNonEmptyString(message.pairing_id) || !isNonEmptyString(message.code)) {
      return { code: 'invalid_message', message: 'Gateway pairing_confirm is incomplete' };
    }
    return null;
  }
  if (message.type === 'session_revoke') {
    if (!isNonEmptyString(message.credential_ref)) {
      return { code: 'invalid_message', message: 'Gateway session_revoke is incomplete' };
    }
    return null;
  }
  if (message.type === 'ping') {
    if (!isIsoTimestamp(message.sent_at)) return { code: 'invalid_message', message: 'Gateway ping sent_at is invalid' };
    return null;
  }
  return { code: 'unknown_type', message: `Unsupported Gateway client message type: ${message.type}` };
}

export function createReferenceGateway({
  deviceId = null, nowFn = () => Date.now(), historyLimit = 20, store = null,
  sessionTtlMs = 8 * 60 * 60 * 1000,
} = {}) {
  let snapshot = createGatewaySnapshot({ deviceId: deviceId ?? 'device-01', generatedAt: new Date(nowFn()).toISOString() });
  let messageSequence = 0;
  const clients = new Map();
  let history = [];
  const ledger = new Map();
  const pendingPairings = new Map();
  const pairedDevices = new Map();
  const revokedCredentials = new Set();

  function persistState() {
    if (!store || typeof store.save !== 'function') return;
    store.save({
      schema_version: 2,
      snapshot,
      history: [...history],
      ledger: [...ledger.entries()].map(([commandId, record]) => ({ command_id: commandId, ...record })),
      devices: [...pairedDevices.entries()].map(([credentialRef, record]) => ({ credential_ref: credentialRef, ...record })),
      revoked_credentials: [...revokedCredentials],
    });
  }

  function authorizeHello(message) {
    if (!message.auth) return { status: 'pairing_required', reason: 'credential_missing', scope: [], session: null };
    if (message.auth.mode === 'reference' && message.auth.credential_ref === referenceCredential) {
      return { status: 'authorized', reason: null, scope: referenceScope, session: null };
    }
    if (message.auth.mode === 'paired_session') {
      if (revokedCredentials.has(message.auth.credential_ref)) {
        return { status: 'unauthorized', reason: 'credential_revoked', scope: [], session: null };
      }
      const device = pairedDevices.get(message.auth.credential_ref);
      if (!device || device.device_id !== message.device_id) {
        return { status: 'unauthorized', reason: 'credential_invalid', scope: [], session: null };
      }
      const session = {
        id: `sess-${String(messageSequence + 1).padStart(6, '0')}`,
        principal_id: device.principal_id,
        tenant_id: device.tenant_id,
        device_id: device.device_id,
        expires_at: new Date(nowFn() + sessionTtlMs).toISOString(),
      };
      if (!Number.isFinite(Date.parse(session.expires_at)) || Date.parse(session.expires_at) <= nowFn()) {
        return { status: 'unauthorized', reason: 'session_expired', scope: [], session: null };
      }
      return { status: 'authorized', reason: null, scope: device.permission_scope, session };
    }
    return { status: 'unauthorized', reason: 'credential_invalid', scope: [], session: null };
  }

  const persistedState = store && typeof store.load === 'function' ? store.load() : null;
  if (persistedState) {
    if (!isRecord(persistedState) || persistedState.schema_version !== 2
      || !isRecord(persistedState.snapshot) || !Array.isArray(persistedState.history)
      || !Array.isArray(persistedState.ledger) || !Array.isArray(persistedState.devices)
      || !Array.isArray(persistedState.revoked_credentials)) {
      throw new Error('reference_gateway_store_invalid');
    }
    snapshot = persistedState.snapshot;
    history = persistedState.history.slice(-historyLimit);
    for (const record of persistedState.ledger) {
      const commandId = record?.command_id ?? record?.commandId;
      if (isNonEmptyString(commandId)) {
        const { command_id: _commandId, commandId: _legacyCommandId, ...ledgerRecord } = record;
        ledger.set(commandId, ledgerRecord);
      }
    }
    for (const device of persistedState.devices) {
      if (isRecord(device) && isNonEmptyString(device.credential_ref) && isNonEmptyString(device.device_id)
        && isNonEmptyString(device.tenant_id) && isNonEmptyString(device.principal_id)
        && Array.isArray(device.permission_scope)) {
        const { credential_ref: credentialRef, ...record } = device;
        pairedDevices.set(credentialRef, record);
      }
    }
    for (const credentialRef of persistedState.revoked_credentials) {
      if (isNonEmptyString(credentialRef)) revokedCredentials.add(credentialRef);
    }
  } else {
    persistState();
  }

  function nextEventId() {
    return `evt-${Number(snapshot.revision) + 1}`;
  }

  function nextMessageId() {
    messageSequence += 1;
    return `reference-gateway-${String(messageSequence).padStart(6, '0')}`;
  }

  function send(socket, payload) {
    if (socket.readyState !== 1) return;
    socket.send(JSON.stringify({ protocol: gatewayProtocol, message_id: nextMessageId(), ...payload }));
  }

  function sendError(socket, requestMessageId, code, message, retryable = false, details = {}) {
    send(socket, {
      type: 'error',
      code: errorCodes.has(code) ? code : 'server_unavailable',
      message,
      retryable,
      request_message_id: requestMessageId ?? null,
      details,
    });
  }

  function sendSnapshot(socket) {
    send(socket, { type: 'snapshot', event_id: snapshot.event_id, snapshot });
  }

  function sendAck(socket, commandId, status, phase, reason = null, finalEventId = null, retryable = false) {
    send(socket, {
      type: 'command_ack', command_id: commandId, status, phase, reason, final_event_id: finalEventId, retryable,
    });
  }

  function sendStoredEvent(socket, eventPayload) {
    send(socket, eventPayload);
  }

  function broadcastEvent(eventPayload) {
    for (const context of clients.values()) {
      if (context.authorization.status === 'authorized') sendStoredEvent(context.socket, eventPayload);
    }
  }

  function appendEvent(eventPayload) {
    history.push(eventPayload);
    while (history.length > historyLimit) history.shift();
  }

  function handleHello(socket, message) {
    const auth = authorizeHello(message);
    const session = auth.session;
    const context = {
      socket,
      clientId: message.client_id,
      deviceId: message.device_id,
      sessionId: session ? session.id : 'reference-session',
      expiresAt: session ? session.expires_at : null,
      authorization: auth,
      seenMessageIds: new Set([message.message_id]),
    };
    clients.set(socket, context);
    send(socket, {
      type: 'hello_ack',
      connection_id: `reference-connection-${nextMessageId()}`,
      session: {
        id: context.sessionId,
        principal_id: session ? session.principal_id : (auth.status === 'authorized' ? 'reference-user' : null),
        tenant_id: session ? session.tenant_id : (auth.status === 'authorized' ? 'reference-tenant' : null),
        device_id: session ? session.device_id : message.device_id,
        expires_at: session ? session.expires_at : null,
      },
      authorization: { status: auth.status, permission_scope: auth.scope, reason: auth.reason },
      server_time: new Date(nowFn()).toISOString(),
      resume_supported: true,
      capabilities: auth.status === 'authorized'
        ? ['snapshot', 'events', 'needs_you:write', 'pairing', 'resync']
        : ['pairing'],
    });
    if (auth.status !== 'authorized') return;

    if (typeof message.resume_after === 'string') {
      const cursorIsBaseline = message.resume_after === snapshot.event_id;
      const cursorIndex = history.findIndex((event) => event.event_id === message.resume_after);
      if (!cursorIsBaseline && cursorIndex < 0) {
        send(socket, { type: 'resync_required', reason: 'resume_cursor_unknown', after_revision: snapshot.revision });
        return;
      }
      history.slice(cursorIsBaseline ? 0 : cursorIndex + 1).forEach((event) => sendStoredEvent(socket, event));
      return;
    }
    sendSnapshot(socket);
  }

  function rejectCommand(socket, message, reason, retryable = false) {
    const existing = ledger.get(message.command_id);
    if (!existing) {
      ledger.set(message.command_id, {
        fingerprint: fingerprint(message), status: 'rejected', phase: 'not_applicable', finalEventId: null, reason, retryable,
      });
      persistState();
    }
    sendAck(socket, message.command_id, 'rejected', 'not_applicable', reason, null, retryable);
  }

  function handleCommand(socket, message) {
    const context = clients.get(socket);
    if (!context || context.authorization.status !== 'authorized') {
      sendError(socket, message.message_id, 'unauthorized', 'Gateway command requires an authorized session');
      return;
    }
    if (context.expiresAt) {
      const expiresAtMs = Date.parse(context.expiresAt);
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowFn()) {
        sendError(socket, message.message_id, 'unauthorized', 'Gateway session expired');
        return;
      }
    }
    if (!context.authorization.scope.includes('needs_you:write')) {
      rejectCommand(socket, message, 'permission_denied');
      return;
    }

    const existing = ledger.get(message.command_id);
    if (existing) {
      if (existing.fingerprint !== fingerprint(message)) {
        sendError(socket, message.message_id, 'duplicate_command', 'command_id 已绑定另一条命令');
        return;
      }
      sendAck(
        socket,
        message.command_id,
        'duplicate',
        existing.finalEventId ? 'final' : existing.status === 'accepted' ? 'pending_event' : 'not_applicable',
        existing.reason,
        existing.finalEventId,
        existing.retryable,
      );
      if (existing.finalEventId) {
        const finalEvent = history.find((event) => event.event_id === existing.finalEventId);
        if (finalEvent) sendStoredEvent(socket, finalEvent);
      }
      return;
    }

    if (message.precondition.event_id !== snapshot.event_id || message.precondition.revision !== snapshot.revision) {
      rejectCommand(socket, message, 'stale_target', true);
      return;
    }
    const target = snapshot.needs_you.find((item) => item.id === message.target.needs_you_id);
    if (!target || target.agent_id !== message.target.agent_id) {
      rejectCommand(socket, message, 'invalid_target');
      return;
    }
    if (target.status !== 'pending') {
      rejectCommand(socket, message, 'policy_denied');
      return;
    }
    if (!target.actions.includes(message.command)) {
      rejectCommand(socket, message, 'action_not_allowed');
      return;
    }

    ledger.set(message.command_id, {
      fingerprint: fingerprint(message), status: 'accepted', phase: 'pending_event', finalEventId: null, reason: null, retryable: false,
    });
    persistState();
    sendAck(socket, message.command_id, 'accepted', 'pending_event', null, null, false);

    const sourceEventId = snapshot.event_id;
    const sourceRevision = snapshot.revision;
    const eventId = nextEventId();
    const generatedAt = new Date(nowFn()).toISOString();
    const status = decisionStatus(message.command);
    snapshot = {
      ...snapshot,
      revision: sourceRevision + 1,
      event_id: eventId,
      generated_at: generatedAt,
      needs_you: snapshot.needs_you.map((item) => item.id === target.id ? { ...item, status } : item),
    };
    const eventPayload = {
      type: 'event', event_id: eventId, revision: snapshot.revision, generated_at: generatedAt,
      actor: { kind: 'user', id: 'reference-user' },
      audit: {
        tenant_id: 'reference-tenant', principal_id: 'reference-user', device_id: context.deviceId,
        session_id: context.sessionId, command_id: message.command_id,
        source_event_id: sourceEventId, source_revision: sourceRevision,
      },
      event: { type: 'needs_you_resolved', needs_you_id: target.id, status, command_id: message.command_id },
    };
    appendEvent(eventPayload);
    ledger.set(message.command_id, {
      fingerprint: fingerprint(message), status: 'accepted', phase: 'final', finalEventId: eventId, reason: null, retryable: false,
    });
    persistState();
    broadcastEvent(eventPayload);
  }

  function handlePairingBegin(socket, message) {
    const pairingId = `pairing-${nextMessageId()}`;
    pendingPairings.set(pairingId, { deviceId: message.device_id });
    send(socket, {
      type: 'pairing_challenge', pairing_id: pairingId,
      expires_at: new Date(nowFn() + 5 * 60 * 1000).toISOString(), display_code: '000000',
    });
  }

  function handlePairingConfirm(socket, message) {
    const pairing = pendingPairings.get(message.pairing_id);
    if (!pairing || message.code !== '000000') {
      send(socket, { type: 'pairing_result', pairing_id: message.pairing_id, status: 'rejected', credential_ref: null, reason: 'pairing_code_invalid' });
      return;
    }
    pendingPairings.delete(message.pairing_id);
    const credentialRef = `paired:${pairing.deviceId}:${String(messageSequence + 1).padStart(6, '0')}`;
    pairedDevices.set(credentialRef, {
      device_id: pairing.deviceId,
      tenant_id: 'reference-tenant',
      principal_id: 'reference-user',
      permission_scope: [...referenceScope],
    });
    persistState();
    send(socket, { type: 'pairing_result', pairing_id: message.pairing_id, status: 'paired', credential_ref: credentialRef, reason: null });
  }

  function handleSessionRevoke(socket, message) {
    if (!pairedDevices.has(message.credential_ref)) {
      sendError(socket, message.message_id, 'credential_not_found', 'Gateway paired credential not found');
      return;
    }
    if (!revokedCredentials.has(message.credential_ref)) {
      revokedCredentials.add(message.credential_ref);
      persistState();
    }
    send(socket, {
      type: 'session_revoked',
      credential_ref: message.credential_ref,
      revoked_at: new Date(nowFn()).toISOString(),
      reason: null,
    });
  }

  function handleMessage(socket, raw) {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      sendError(socket, null, 'invalid_message', 'reference Gateway 收到非法 JSON');
      return;
    }
    const issue = validateClientMessage(message);
    if (issue) {
      sendError(socket, message?.message_id ?? null, issue.code, issue.message);
      return;
    }
    const context = clients.get(socket);
    if (context?.seenMessageIds.has(message.message_id)) {
      sendError(socket, message.message_id, 'invalid_message', 'message_id 重复');
      return;
    }
    if (context) context.seenMessageIds.add(message.message_id);

    switch (message.type) {
      case 'hello':
        handleHello(socket, message);
        break;
      case 'command':
        handleCommand(socket, message);
        break;
      case 'pairing_begin':
        handlePairingBegin(socket, message);
        break;
      case 'pairing_confirm':
        handlePairingConfirm(socket, message);
        break;
      case 'session_revoke':
        handleSessionRevoke(socket, message);
        break;
      case 'ping':
        send(socket, { type: 'pong', request_message_id: message.message_id, server_time: new Date(nowFn()).toISOString() });
        break;
    }
  }

  return {
    attach(socket) {
      socket.on('message', (raw) => handleMessage(socket, raw));
      socket.on('close', () => clients.delete(socket));
    },
    getSnapshot() {
      return snapshot;
    },
    getHistory() {
      return [...history];
    },
    getLedger() {
      return new Map(ledger);
    },
  };
}
