// The official package's `Grok` default export is the Mono mark; the other
// statics (Avatar/Combine/Text) pull in the package's shared feature modules.
// This offline entry re-exports the exact module the site example renders so
// `import { Grok } from '@lobehub/icons'` works without antd/@lobehub/ui.
import Grok from './es/Grok/components/Mono.js';

export { Grok };
export default Grok;
