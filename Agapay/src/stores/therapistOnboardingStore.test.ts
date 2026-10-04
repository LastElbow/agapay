import { therapistOnboardingStore } from '@/src/stores/therapistOnboardingStore';

describe('therapistOnboardingStore', () => {
  beforeEach(() => {
    therapistOnboardingStore.clear();
  });

  it('stores and returns onboarding fields via getAll()', () => {
    therapistOnboardingStore.setProfilePicture('file://pic');
    therapistOnboardingStore.setSpecializationIds([1, 2]);
    therapistOnboardingStore.setConditionIds([5]);
    therapistOnboardingStore.setOtherCondition('Other');
    therapistOnboardingStore.setOtherConditions(['A', 'B']);
    therapistOnboardingStore.setServiceAreaIds([9]);
    therapistOnboardingStore.setFeePerSession(1234);
    therapistOnboardingStore.setGender('Female');

    expect(therapistOnboardingStore.getAll()).toEqual({
      profilePicture: 'file://pic',
      specializationIds: [1, 2],
      conditionIds: [5],
      otherCondition: 'Other',
      otherConditions: ['A', 'B'],
      serviceAreaIds: [9],
      feePerSession: 1234,
      gender: 'Female',
    });
  });

  it('clear resets everything to defaults', () => {
    therapistOnboardingStore.setProfilePicture('x');
    therapistOnboardingStore.setSpecializationIds([1]);
    therapistOnboardingStore.setFeePerSession(1);

    therapistOnboardingStore.clear();

    expect(therapistOnboardingStore.getAll()).toEqual({
      profilePicture: null,
      specializationIds: [],
      conditionIds: [],
      otherCondition: '',
      otherConditions: [],
      serviceAreaIds: [],
      feePerSession: null,
      gender: null,
    });
  });
});
