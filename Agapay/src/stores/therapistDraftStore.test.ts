import { DraftStore } from '@/src/stores/therapistDraftStore';

describe('therapistDraftStore', () => {
  beforeEach(() => {
    DraftStore.reset();
  });

  it('getAndReset returns current draft changes then clears them', () => {
    DraftStore.updatedSpecializations = [1, 2];
    DraftStore.updatedConditions = [3];
    DraftStore.updatedServiceAreas = [4, 5];

    const snapshot = DraftStore.getAndReset();

    expect(snapshot).toEqual({
      updatedSpecializations: [1, 2],
      updatedConditions: [3],
      updatedServiceAreas: [4, 5],
    });

    expect(DraftStore.updatedSpecializations).toBeNull();
    expect(DraftStore.updatedConditions).toBeNull();
    expect(DraftStore.updatedServiceAreas).toBeNull();
  });
});
