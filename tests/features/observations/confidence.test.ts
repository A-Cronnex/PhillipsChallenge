import {
  deriveOverallConfidence,
  lowestWins,
  majorityVote,
} from '../../../features/observations/domain/confidence';

describe('lowestWins', () => {
  it('returns null when no attribute confidence was recorded', () => {
    expect(lowestWins([])).toBeNull();
  });

  it('returns the single level when only one was recorded', () => {
    expect(lowestWins(['high'])).toBe('high');
  });

  it('returns the lowest level present', () => {
    expect(lowestWins(['high', 'medium', 'low'])).toBe('low');
    expect(lowestWins(['high', 'medium'])).toBe('medium');
    expect(lowestWins(['high', 'high'])).toBe('high');
  });

  it('is not fooled by ordering', () => {
    expect(lowestWins(['low', 'high'])).toBe('low');
    expect(lowestWins(['high', 'low'])).toBe('low');
  });
});

describe('majorityVote', () => {
  it('returns the most frequent level', () => {
    expect(majorityVote(['high', 'high', 'low'])).toBe('high');
  });

  it('breaks a tie towards the lower level', () => {
    expect(majorityVote(['high', 'low'])).toBe('low');
  });

  it('returns null for an empty list', () => {
    expect(majorityVote([])).toBeNull();
  });
});

describe('deriveOverallConfidence', () => {
  it('is currently lowestWins (docs/domain-model.md §15, pending confirmation)', () => {
    expect(deriveOverallConfidence(['high', 'low'])).toBe(
      lowestWins(['high', 'low'])
    );
  });
});
