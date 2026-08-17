import type { Screen } from '../app/types';

interface NavigationBarProps {
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
  agentCount: number;
  serverCount: number;
}

const navigationItems: Array<{ id: Screen; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'needs', label: 'Needs You' },
  { id: 'agents', label: 'Agents' },
  { id: 'servers', label: 'Servers' },
  { id: 'terminal', label: 'Terminal' },
];

export function NavigationBar({ currentScreen, onNavigate, agentCount, serverCount }: NavigationBarProps) {
  return (
    <nav className="navigation-bar" aria-label="主导航">
      <div className="navigation-bar__counts">
        <span>Agent <strong>{agentCount}</strong></span>
        <span>服务器 <strong>{serverCount}</strong></span>
      </div>
      <div className="navigation-bar__buttons">
        {navigationItems.map((item) => (
          <button
            type="button"
            key={item.id}
            className={currentScreen === item.id ? 'navigation-button navigation-button--active' : 'navigation-button'}
            aria-current={currentScreen === item.id ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <span className="navigation-hint">A 查看　B 返回　FN 语音</span>
    </nav>
  );
}
