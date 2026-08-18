import { useEffect } from 'react';
import type { Screen } from './types';

interface HardwareShortcutOptions {
  onNavigate: (screen: Screen) => void;
  onBack: () => void;
  onApprove?: () => void;
  onReject?: () => void;
}

const screenByKey: Record<string, Screen> = {
  h: 'home',
  n: 'needs',
  a: 'agents',
  s: 'servers',
  t: 'terminal',
};

export function useHardwareShortcuts({ onNavigate, onBack, onApprove, onReject }: HardwareShortcutOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onBack();
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'a' && onApprove) {
        event.preventDefault();
        onApprove();
        return;
      }
      if (key === 'x' && onReject) {
        event.preventDefault();
        onReject();
        return;
      }
      const screen = screenByKey[key];
      if (screen) {
        event.preventDefault();
        onNavigate(screen);
        return;
      }
      if (key === 'v') {
        event.preventDefault();
        document.querySelector<HTMLElement>('[aria-label="语音"]')?.click();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onApprove, onBack, onNavigate, onReject]);
}
