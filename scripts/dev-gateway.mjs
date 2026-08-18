import { WebSocketServer } from 'ws';
import { createReferenceGateway } from './reference-gateway-contract.mjs';
import { createJsonGatewayStore } from './reference-gateway-store.mjs';

const port = Number(process.env.AHT_GATEWAY_PORT ?? 8787);
const host = process.env.AHT_GATEWAY_HOST ?? '127.0.0.1';
const dropAfterMs = Number(process.env.AHT_GATEWAY_DROP_AFTER_MS ?? 0);
const deviceId = process.env.AHT_GATEWAY_DEVICE_ID ?? 'device-01';
const storePath = process.env.AHT_GATEWAY_STORE_PATH ?? '';
const server = new WebSocketServer({ host, port });
const gateway = createReferenceGateway({
  deviceId,
  store: storePath ? createJsonGatewayStore(storePath) : null,
});

server.on('connection', (socket) => gateway.attach(socket));

server.on('listening', () => {
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  console.log(`AHT reference Gateway listening on ws://${host}:${actualPort}`);
  if (storePath) console.log(`AHT reference Gateway persistence enabled at ${storePath} (reference only)`);
  if (dropAfterMs > 0) {
    setTimeout(() => {
      console.log('AHT reference Gateway dropping clients for reconnect QA');
      server.clients.forEach((client) => client.close(1001, 'reconnect QA'));
    }, dropAfterMs);
  }
});

function shutdown() {
  server.clients.forEach((client) => client.close(1001, 'reference Gateway stopped'));
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
