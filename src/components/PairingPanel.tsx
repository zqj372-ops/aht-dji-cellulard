import type { PairingState } from '../providers/types';

interface PairingPanelProps {
  pairing: PairingState;
  onBeginPairing: () => void;
  onConfirmPairing: (pairingId: string, code: string) => void;
}

function formatIso(value: string): string {
  return value.replace(/\.\d{3}Z$/, 'Z');
}

export function PairingPanel({ pairing, onBeginPairing, onConfirmPairing }: PairingPanelProps) {
  const begin = () => onBeginPairing();
  const confirm = () => {
    if (pairing.status === 'challenge') {
      onConfirmPairing(pairing.pairingId, pairing.displayCode);
    }
  };

  let content: React.ReactNode;
  if (pairing.status === 'challenge') {
    content = (
      <>
        <p className="pairing-panel__hint">请在手持终端屏幕上核对以下配对码。确认一致后完成配对，Gateway 才会签发授权会话。</p>
        <div className="pairing-code" data-testid="pairing-code" aria-label="配对码">{pairing.displayCode}</div>
        <p className="pairing-panel__meta">有效期至 {formatIso(pairing.expiresAt)}</p>
        <button type="button" className="pairing-panel__button" onClick={confirm}>
          确认设备已显示此代码
        </button>
      </>
    );
  } else if (pairing.status === 'paired') {
    content = <p className="pairing-panel__ok">配对成功，正在建立授权会话…</p>;
  } else if (pairing.status === 'rejected') {
    content = (
      <>
        <p className="pairing-panel__error">配对失败：{pairing.reason ?? '未知原因'}</p>
        <button type="button" className="pairing-panel__button" onClick={begin}>重新开始配对</button>
      </>
    );
  } else if (pairing.status === 'begin_sent') {
    content = (
      <>
        <p className="pairing-panel__hint">配对请求已发送，正在等待 Gateway 确认设备。</p>
        <button type="button" className="pairing-panel__button" disabled>等待设备确认…</button>
      </>
    );
  } else {
    content = (
      <>
        <p className="pairing-panel__hint">此设备尚未注册。发起配对后，Gateway 会签发仅限此设备的授权凭证。</p>
        <button type="button" className="pairing-panel__button" onClick={begin}>开始配对</button>
      </>
    );
  }

  return (
    <div className="pairing-panel" data-testid="pairing-panel" role="dialog" aria-label="设备配对">
      <h2 className="pairing-panel__title">设备配对</h2>
      {content}
    </div>
  );
}
