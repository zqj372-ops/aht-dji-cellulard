import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/app/App';

test('switches from fixture to unavailable gateway and back without falling back silently', () => {
  render(<App />);

  expect(screen.getByRole('button', { name: '切换到 Gateway 数据源' })).toBeInTheDocument();
  expect(screen.getByText(/Fixture · 本地/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Codex：确认部署到生产环境/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '切换到 Gateway 数据源' }));

  expect(screen.getByText(/Gateway ·/)).toBeInTheDocument();
  expect(screen.getByText(/不可用|等待 Gateway 数据/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Codex：确认部署到生产环境/ })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '切换到 Fixture 数据源' }));

  expect(screen.getByText(/Fixture · 本地/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Codex：确认部署到生产环境/ })).toBeInTheDocument();
});
