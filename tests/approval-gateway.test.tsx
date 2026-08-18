import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/app/App';

test('A approves a pending Codex item when the approval panel is open', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /Codex：确认部署到生产环境/ }));

  fireEvent.keyDown(window, { key: 'a' });

  expect(screen.getByText('已批准（模拟）')).toBeInTheDocument();
});

test('X rejects a pending Codex item when the approval panel is open', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /Codex：确认部署到生产环境/ }));

  fireEvent.keyDown(window, { key: 'x' });

  expect(screen.getByText('已拒绝（模拟）')).toBeInTheDocument();
});
