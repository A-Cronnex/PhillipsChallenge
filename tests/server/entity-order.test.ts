/**
 * Dependency ordering within a batch.
 *
 * Without it, a first sync — which carries a site and the observations
 * recorded at it in the same request — rejects the observations for a missing
 * reference even though their site is right there in the batch.
 */
import {
  entityRank,
  orderChangesByDependency,
} from '../../server/src/domain/entity-order';

interface Item {
  entityType: 'site' | 'equipment' | 'observation' | 'conversation';
  id: string;
}

describe('orderChangesByDependency', () => {
  it('applies sites before the equipment that references them', () => {
    const ordered = orderChangesByDependency<Item>([
      { entityType: 'equipment', id: 'e1' },
      { entityType: 'site', id: 's1' },
    ]);

    expect(ordered.map((item) => item.id)).toEqual(['s1', 'e1']);
  });

  it('applies observations last, after every entity they can reference', () => {
    const ordered = orderChangesByDependency<Item>([
      { entityType: 'observation', id: 'o1' },
      { entityType: 'conversation', id: 'c1' },
      { entityType: 'equipment', id: 'e1' },
      { entityType: 'site', id: 's1' },
    ]);

    expect(ordered.map((item) => item.entityType)).toEqual([
      'site',
      'equipment',
      'conversation',
      'observation',
    ]);
  });

  it('keeps the original order within one entity type', () => {
    // Stability matters if a device ever queues two versions of one record:
    // reordering them would leave the older version as the winner.
    const ordered = orderChangesByDependency<Item>([
      { entityType: 'site', id: 's1' },
      { entityType: 'site', id: 's2' },
      { entityType: 'site', id: 's3' },
    ]);

    expect(ordered.map((item) => item.id)).toEqual(['s1', 's2', 's3']);
  });

  it('does not mutate the input', () => {
    const input: Item[] = [
      { entityType: 'observation', id: 'o1' },
      { entityType: 'site', id: 's1' },
    ];

    orderChangesByDependency(input);

    expect(input.map((item) => item.id)).toEqual(['o1', 's1']);
  });

  it('returns an empty array unchanged', () => {
    expect(orderChangesByDependency([])).toEqual([]);
  });

  it('ranks every entity type distinctly', () => {
    const ranks = (['site', 'equipment', 'conversation', 'observation'] as const).map(
      entityRank
    );
    expect(new Set(ranks).size).toBe(4);
  });
});
