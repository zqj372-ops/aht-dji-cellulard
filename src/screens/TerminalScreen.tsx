import { useState } from 'react';

export function TerminalScreen() {
  const [command, setCommand] = useState('');
  const [lines, setLines] = useState(['fixture@tokyo-01:~$ status', 'Agent Gateway online · local fixture']);

  const sendCommand = () => {
    const next = command.trim();
    if (!next) return;
    setLines((current) => [...current, `fixture@tokyo-01:~$ ${next}`, `模拟回显：${next}`]);
    setCommand('');
  };

  return (
    <section className="terminal-screen" aria-labelledby="terminal-heading">
      <div className="screen-heading screen-heading--compact">
        <div><h1 id="terminal-heading">Mosh Terminal</h1><p>Local Echo · 只读模拟连接</p></div>
        <span className="terminal-connection">FIXTURE</span>
      </div>
      <div className="terminal-output" aria-live="polite">{lines.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}</div>
      <div className="terminal-input-row"><span aria-hidden="true">$</span><input value={command} onChange={(event) => setCommand(event.target.value)} aria-label="终端命令" placeholder="输入模拟命令" onKeyDown={(event) => { if (event.key === 'Enter') sendCommand(); }} /><button type="button" onClick={sendCommand}>发送</button></div>
    </section>
  );
}
