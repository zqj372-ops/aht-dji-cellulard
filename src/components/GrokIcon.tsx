import { Grok } from '@lobehub/icons';
import type { CSSProperties } from 'react';

interface GrokIconProps {
  /** Render size in px (or any CSS length). Matches the site example `<Grok size={56} />`. */
  size?: number | string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Official LobeHub Grok mark, rendered with the exact site import:
 *
 *   import { Grok } from '@lobehub/icons';
 *   export default () => <Grok size={56} />;
 *
 * `@lobehub/icons` resolves to the vendored official 1.94.0 tarball
 * (`vendor/lobehub-icons`, MIT, see LICENSE there). The vendored entry
 * re-exports the package's own `es/Grok` default export (Grok Mono), so the
 * browser mark is byte-identical to the LobeHub site without pulling in
 * antd/@lobehub/ui, which the offline device build cannot install.
 * The same path feeds `src/assets/agents/grok.svg`, the favicon, and the
 * native MainUI desktop icon.
 */
export function GrokIcon({ size = 56, className, style }: GrokIconProps) {
  return <Grok data-testid="grok-icon" size={size} className={className} style={style} />;
}
