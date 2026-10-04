import {
  buildPreferencesSubmitPayload,
  filterCategoriesByServiceQuery,
  getMatchedCategoryIdsByServiceQuery,
  getPreferredSpecializationsFromIncoming,
  mapSpecializationsToCategoryIds,
  reorderCategoriesBySelectedIds,
  safeParseIncomingPreferencesData,
} from '@/src/features/recommendations/core/preferencesStep2';

describe('preferencesStep2', () => {
  describe('safeParseIncomingPreferencesData', () => {
    it('returns {} for invalid JSON', () => {
      expect(safeParseIncomingPreferencesData(undefined)).toEqual({});
      expect(safeParseIncomingPreferencesData('')).toEqual({});
      expect(safeParseIncomingPreferencesData('{oops}')).toEqual({});
      expect(safeParseIncomingPreferencesData('123')).toEqual({});
    });

    it('parses object JSON', () => {
      expect(safeParseIncomingPreferencesData('{"a":1}')).toEqual({ a: 1 });
    });
  });

  describe('getPreferredSpecializationsFromIncoming', () => {
    it('reads array or single string', () => {
      expect(getPreferredSpecializationsFromIncoming({ preferredSpecializations: ['A', 'B'] })).toEqual([
        'A',
        'B',
      ]);
      expect(getPreferredSpecializationsFromIncoming({ preferredSpecialization: 'C' })).toEqual(['C']);
      expect(getPreferredSpecializationsFromIncoming({})).toEqual([]);
    });
  });

  describe('mapSpecializationsToCategoryIds', () => {
    it('maps known specialization names to category ids', () => {
      const map = { Ortho: 'cat1', Neuro: 'cat2' };
      expect(mapSpecializationsToCategoryIds(['Ortho', 'Unknown', 'Neuro'], map)).toEqual([
        'cat1',
        'cat2',
      ]);
    });
  });

  describe('reorderCategoriesBySelectedIds', () => {
    it('brings selected ids to the top in selection order', () => {
      const cats = [
        { id: 'a', category: 'A' },
        { id: 'b', category: 'B' },
        { id: 'c', category: 'C' },
      ];
      const out = reorderCategoriesBySelectedIds(cats, ['c', 'a']);
      expect(out.map((c) => c.id)).toEqual(['c', 'a', 'b']);
    });

    it('returns original when no selected ids', () => {
      const cats = [{ id: 'a' }, { id: 'b' }];
      expect(reorderCategoriesBySelectedIds(cats, [])).toBe(cats);
    });
  });

  describe('filterCategoriesByServiceQuery / getMatchedCategoryIdsByServiceQuery', () => {
    const categories = [
      {
        id: 'cat1',
        category: 'One',
        services: [{ id: 's1', name: 'Back Pain' }, { id: 's2', name: 'Neck Pain' }],
      },
      {
        id: 'cat2',
        category: 'Two',
        services: [{ id: 's3', name: 'Sports Injury' }],
      },
    ];

    it('filters services case-insensitively and drops empty categories', () => {
      const filtered = filterCategoriesByServiceQuery(categories as any, 'pain');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('cat1');
      expect((filtered[0] as any).services.map((s: any) => s.id)).toEqual(['s1', 's2']);
    });

    it('returns all categories when query empty', () => {
      expect(filterCategoriesByServiceQuery(categories as any, '')).toBe(categories as any);
    });

    it('computes matched category ids for auto-expand', () => {
      expect(getMatchedCategoryIdsByServiceQuery(categories as any, 'injury')).toEqual(['cat2']);
      expect(getMatchedCategoryIdsByServiceQuery(categories as any, '')).toEqual([]);
    });
  });

  describe('buildPreferencesSubmitPayload', () => {
    it('merges incoming and overrides desiredServices + PreferredBarangay', () => {
      const incoming = { sessionBudget: 100, desiredServices: ['old'] };
      const payload = buildPreferencesSubmitPayload({
        incoming,
        desiredServices: ['s1', 's2'],
        patientProfile: { barangay: 'B1' },
      });

      expect(payload).toEqual({
        sessionBudget: 100,
        desiredServices: ['s1', 's2'],
        PreferredBarangay: 'B1',
      });
    });

    it('supports Barangay fallback', () => {
      const payload = buildPreferencesSubmitPayload({
        incoming: {},
        desiredServices: [],
        patientProfile: { Barangay: 'B2' },
      });
      expect(payload.PreferredBarangay).toBe('B2');
    });
  });
});
