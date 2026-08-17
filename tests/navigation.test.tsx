import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/app/App';

test('navigates to servers and shows fixture metrics', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Servers' }));
  expect(screen.getByText('SERVER · TOKYO-01')).toBeInTheDocument();
  expect(screen.getByText('Agent Gateway')).toBeInTheDocument();
});

test('terminal is a separate screen and voice control has local recording state', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
  expect(screen.getByText('Mosh Terminal')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '语音' }));
  expect(screen.getByText('录音中（模拟）')).toBeInTheDocument();
});
