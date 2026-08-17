import type { ServerSnapshot } from '../app/types';

interface ServersScreenProps { servers: ServerSnapshot[]; }

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="server-metric"><span>{label}</span><strong>{value}</strong></div>;
}

export function ServersScreen({ servers }: ServersScreenProps) {
  return (
    <section aria-labelledby="servers-heading">
      <div className="screen-heading screen-heading--compact">
        <div><h1 id="servers-heading">Servers</h1><p>Agent 运行环境 · 本地模拟数据</p></div>
        <strong>{servers.length}</strong>
      </div>
      <div className="server-list">
        {servers.map((server) => (
          <article className="server-card" key={server.id}>
            <div className="server-card__header"><div><h2>SERVER · {server.displayName}</h2><span className="online-label">● ONLINE</span></div><span className="fixture-tag">FIXTURE</span></div>
            <div className="server-metrics">
              <Metric label="Ping" value={`${server.rtt}ms`} /><Metric label="CPU" value={`${server.cpu}%`} />
              <Metric label="RAM" value={`${server.ram}%`} /><Metric label="Disk" value={`${server.disk}%`} />
              <Metric label="Load" value={server.load} /><Metric label="Docker" value={`${server.dockerRunning} Running`} />
            </div>
            <div className="server-services"><span>Agent Gateway <b>●</b></span><span>Tailscale <b>●</b></span><span>SSH <b>●</b></span><span>Restarting <b className="service-warning">{server.dockerRestarting}</b></span></div>
          </article>
        ))}
      </div>
    </section>
  );
}
