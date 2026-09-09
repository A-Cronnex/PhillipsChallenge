/**
 * Derivation of an observation's overall confidence from its per-attribute
 * confidence values.
 *
 * docs/domain-model.md §7 and docs/ai-agent.md §9 both require the overall
 * value to be produced by an *explicit* rule, but docs/domain-model.md §15
 * lists the choice of rule ("majority vote or another method") as an open
 * decision. It is therefore implemented here as a named, swappable strategy
 * rather than hard-coded, and the active choice is flagged below as pending
 * confirmation.
 */
import type { ConfidenceLevel } from '../../../types/domain';

export type OverallConfidenceStrategy = (
  levels: ConfidenceLevel[]
) => ConfidenceLevel | null;

const RANK: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };

/**
 * The overall value is the *lowest* confidence among the recorded attributes.
 *
 * Rationale: an observation is only as trustworthy as its weakest identifying
 * attribute. If the brand is certain but the model is a guess, describing the
 * observation as "high confidence" overstates what is actually known, and the
 * dashboard would present a guess as a fact.
 */
export const lowestWins: OverallConfidenceStrategy = (levels) => {
  if (levels.length === 0) return null;
  return levels.reduce((worst, level) =>
    RANK[level] < RANK[worst] ? level : worst
  );
};

/**
 * Majority vote, provided for comparison when the decision is made.
 * Ties fall back to the lowest of the tied levels, for the reason above.
 */
export const majorityVote: OverallConfidenceStrategy = (levels) => {
  if (levels.length === 0) return null;
  const counts = new Map<ConfidenceLevel, number>();
  for (const level of levels) counts.set(level, (counts.get(level) ?? 0) + 1);

  let winner: ConfidenceLevel | null = null;
  let winnerCount = -1;
  for (const [level, count] of counts) {
    if (
      count > winnerCount ||
      (count === winnerCount && winner !== null && RANK[level] < RANK[winner])
    ) {
      winner = level;
      winnerCount = count;
    }
  }
  return winner;
};

/**
 * PROPOSED — pending confirmation (docs/domain-model.md §15).
 *
 * `lowestWins` is the active rule. Changing it is a single-line edit here;
 * nothing else in the codebase encodes the choice.
 */
export const deriveOverallConfidence: OverallConfidenceStrategy = lowestWins;
