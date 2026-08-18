import { fixtureState, getNeedsYouCount } from '../src/app/fixtureState';

test('fixture includes the seven supported agents and four actionable items', () => {
  expect(fixtureState.agents.map((agent) => agent.id)).toEqual([
    'codex', 'deepseek-harness', 'claude-code', 'gemini-cli',
    'hermes-agent', 'openclaw', 'opencode',
  ]);
  expect(getNeedsYouCount(fixtureState)).toBe(4);
});

test('DeepSeek Harness keeps its developer-preview label', () => {
  const agent = fixtureState.agents.find((item) => item.id === 'deepseek-harness');
  expect(agent?.displayName).toBe('DeepSeek Harness');
  expect(agent?.shortName).toBe('dsh');
  expect(agent?.availability).toBe('developer_preview');
});
