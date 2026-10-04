import type { Recommendation } from '@/src/services/recommendations';
import {
  formatGenderLabel,
  formatListOrNotSpecified,
  getMatchPercentage,
  getUserFacingRecommendationsError,
  getUserIdForRecommendations,
  splitRecommendationsByThreshold,
} from '@/src/features/recommendations/core/matcherUi';

describe('matcherUi', () => {
  describe('getUserIdForRecommendations', () => {
    it('returns null when missing', () => {
      expect(getUserIdForRecommendations(null)).toBeNull();
      expect(getUserIdForRecommendations(undefined)).toBeNull();
      expect(getUserIdForRecommendations({})).toBeNull();
    });

    it('picks id/_id/userId and stringifies', () => {
      expect(getUserIdForRecommendations({ id: 123 })).toBe('123');
      expect(getUserIdForRecommendations({ _id: 'u2' })).toBe('u2');
      expect(getUserIdForRecommendations({ userId: ' u3 ' })).toBe('u3');
    });

    it('returns null for blank strings', () => {
      expect(getUserIdForRecommendations({ id: '   ' })).toBeNull();
    });
  });

  describe('getUserFacingRecommendationsError', () => {
    it('returns null when not isError', () => {
      expect(
        getUserFacingRecommendationsError({
          isError: false,
          queryError: { response: { status: 401 } },
        }),
      ).toBeNull();
    });

    it('maps status codes to UI messages', () => {
      expect(
        getUserFacingRecommendationsError({
          isError: true,
          queryError: { response: { status: 401 } },
        }),
      ).toBe('Your session expired. Please sign in again.');

      expect(
        getUserFacingRecommendationsError({
          isError: true,
          queryError: { response: { status: 403, data: { message: 'Nope' } } },
        }),
      ).toBe('Nope');

      expect(
        getUserFacingRecommendationsError({
          isError: true,
          queryError: { response: { status: 403 } },
        }),
      ).toBe('You need a Patient account to view recommendations.');

      expect(
        getUserFacingRecommendationsError({
          isError: true,
          queryError: { response: { status: 404 } },
        }),
      ).toBe('Set your patient preferences first to view recommendations.');

      expect(
        getUserFacingRecommendationsError({
          isError: true,
          queryError: { response: { status: 409, data: { message: 'Prefs missing' } } },
        }),
      ).toBe('Prefs missing');

      expect(
        getUserFacingRecommendationsError({
          isError: true,
          queryError: { response: { status: 500 } },
        }),
      ).toBe('Failed to load recommendations.');
    });
  });

  describe('splitRecommendationsByThreshold', () => {
    const rec = (matchScore: number): Recommendation =>
      ({
        therapistId: 1,
        therapistName: 't',
        profilePictureUrl: null,
        matchScore,
        tier: 'Recommended',
        tierLabel: 'R',
        breakdown: null,
      }) as Recommendation;

    it('splits with inclusive threshold', () => {
      const { recommendedItems, otherItems } = splitRecommendationsByThreshold(
        [rec(0.69), rec(0.7), rec(0.71)],
        0.7,
      );
      expect(recommendedItems.map((r) => r.matchScore)).toEqual([0.7, 0.71]);
      expect(otherItems.map((r) => r.matchScore)).toEqual([0.69]);
    });

    it('treats missing matchScore as 0', () => {
      const weird = { ...rec(1), matchScore: undefined as any } as Recommendation;
      const { recommendedItems, otherItems } = splitRecommendationsByThreshold([weird], 0.7);
      expect(recommendedItems).toHaveLength(0);
      expect(otherItems).toHaveLength(1);
    });
  });

  describe('getMatchPercentage', () => {
    it('rounds and guards non-numbers', () => {
      expect(getMatchPercentage(0.723)).toBe(72);
      expect(getMatchPercentage('0.5')).toBe(50);
      expect(getMatchPercentage('nope')).toBe(0);
      expect(getMatchPercentage(null)).toBe(0);
    });
  });

  describe('formatters', () => {
    it('formats gender label', () => {
      expect(formatGenderLabel('Male')).toBe('Male');
      expect(formatGenderLabel('  ')).toBe('Gender not specified');
      expect(formatGenderLabel(null)).toBe('Gender not specified');
    });

    it('formats list values or not specified', () => {
      expect(formatListOrNotSpecified(['A', 'B'])).toBe('A, B');
      expect(formatListOrNotSpecified([])).toBe('Not specified');
      expect(formatListOrNotSpecified(null)).toBe('Not specified');
      expect(formatListOrNotSpecified(['  ', 'X'])).toBe('X');
    });
  });
});
