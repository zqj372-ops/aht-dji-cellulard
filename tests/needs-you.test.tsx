import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/app/App';

test('approval requires opening the item before the local decision is applied', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /Codex/ }));
  expect(screen.getByText('确认部署到生产环境')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '批准' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '拒绝' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '批准' }));
  expect(screen.getByText('已批准（模拟）')).toBeInTheDocument();
});

test('DeepSeek Harness is visible as a developer-preview inbox item', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: /DeepSeek Harness/ })).toBeInTheDocument();
  expect(screen.getByText(/dsh 开发者预览/)).toBeInTheDocument();
});
