import { render, screen } from '@testing-library/react';
import { App } from '../src/app/App';

test('uses the hardware viewport contract and equal white icon tiles', () => {
  render(<App />);
  expect(screen.getByTestId('device-viewport')).toHaveAttribute('data-logical-size', '1024x768');
  const iconTiles = screen.getAllByTestId('agent-icon-tile');
  expect(iconTiles).not.toHaveLength(0);
  expect(iconTiles.every((node) => node.classList.contains('agent-icon-tile--white'))).toBe(true);
});
