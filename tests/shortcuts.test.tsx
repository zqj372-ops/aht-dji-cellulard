import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/app/App';

test('keyboard shortcuts mirror the hardware hints without changing the logical viewport', () => {
  render(<App />);
  fireEvent.keyDown(window, { key: 's' });
  expect(screen.getByText('SERVER · TOKYO-01')).toBeInTheDocument();
  expect(screen.getByTestId('device-viewport')).toHaveAttribute('data-logical-size', '1024x768');
});
