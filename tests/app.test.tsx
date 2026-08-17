import { render, screen } from '@testing-library/react';
import { App } from '../src/app/App';

test('shows the Chinese AHT home screen and DeepSeek Harness entry', () => {
  render(<App />);
  expect(screen.getByText('现在需要你')).toBeInTheDocument();
  expect(screen.getByText('DeepSeek Harness')).toBeInTheDocument();
  expect(screen.getByText('1024 × 768')).toBeInTheDocument();
});
