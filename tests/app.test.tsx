import { render, screen } from '@testing-library/react';
import { App } from '../src/app/App';

test('shows the Chinese AHT home screen and DeepSeek Harness entry', () => {
  render(<App />);
  expect(screen.getByText('现在需要你')).toBeInTheDocument();
  expect(screen.getByText('DeepSeek Harness')).toBeInTheDocument();
  expect(screen.getByText('1024 × 768')).toBeInTheDocument();
});

test('home screen matches the approved visual contract', () => {
  render(<App />);

  expect(screen.getByTestId('home-screen')).toHaveAttribute('data-screen', 'home');
  expect(screen.getByTestId('home-summary')).toBeInTheDocument();
  expect(screen.getAllByTestId('inbox-card')).toHaveLength(4);
  expect(screen.getAllByTestId('agent-icon-tile')).toHaveLength(4);
  expect(screen.getByText('确认部署到生产环境 · 高风险')).toBeInTheDocument();
  expect(screen.getByText('dsh 开发者预览 · 插件状态待确认')).toBeInTheDocument();
});
