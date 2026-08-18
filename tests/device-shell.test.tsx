import { render, screen } from '@testing-library/react';
import { App } from '../src/app/App';

test('uses the hardware viewport contract and equal white icon tiles', () => {
  render(<App />);
  expect(screen.getByTestId('device-viewport')).toHaveAttribute('data-logical-size', '1024x768');
  expect(screen.getByTestId('device-viewport')).toHaveAttribute('data-reference-layout', 'industrial');
  const iconTiles = screen.getAllByTestId('agent-icon-tile');
  expect(iconTiles).not.toHaveLength(0);
  expect(iconTiles.every((node) => node.classList.contains('agent-icon-tile--white'))).toBe(true);
});

test('shows the official LobeHub Grok desktop brand mark in the status bar', () => {
  render(<App />);
  const brand = screen.getByTestId('status-brand');
  const svg = brand.querySelector('svg');
  expect(svg).not.toBeNull();
  expect(svg!.querySelector('title')?.textContent).toBe('Grok');
  expect(svg!.getAttribute('fill')).toBe('currentColor');
  expect(svg!.getAttribute('viewBox')).toBe('0 0 24 24');
  // Same official path used by src/assets/agents/grok.svg and the MainUI icon.
  expect(svg!.querySelector('path')?.getAttribute('d')).toMatch(/^M9\.27 15\.29/);
});
