import { action, makeObservable, observable } from "mobx";

class TherapistOnboardingStore {
  profilePicture: string | null = null;
  specializationIds: number[] = [];
  conditionIds: number[] = [];
  otherCondition: string = "";
  otherConditions: string[] = [];
  serviceAreaIds: number[] = [];
  feePerSession: number | null = null;
  gender: string | null = null;

  constructor() {
    makeObservable(this, {
      profilePicture: observable,
      specializationIds: observable,
      conditionIds: observable,
      otherCondition: observable,
      otherConditions: observable,
      serviceAreaIds: observable,
      feePerSession: observable,
      gender: observable,
      setProfilePicture: action,
      setSpecializationIds: action,
      setConditionIds: action,
      setOtherCondition: action,
      setOtherConditions: action,
      setServiceAreaIds: action,
      setFeePerSession: action,
      setGender: action,
      clear: action,
    });
  }

  setProfilePicture(uri: string | null) {
    this.profilePicture = uri;
  }

  setSpecializationIds(ids: number[]) {
    this.specializationIds = ids;
  }

  setConditionIds(ids: number[]) {
    this.conditionIds = ids;
  }

  setOtherCondition(value: string) {
    this.otherCondition = value;
  }

  setOtherConditions(conditions: string[]) {
    this.otherConditions = conditions;
  }

  setServiceAreaIds(ids: number[]) {
    this.serviceAreaIds = ids;
  }

  setFeePerSession(fee: number | null) {
    this.feePerSession = fee;
  }

  setGender(gender: string | null) {
    this.gender = gender;
  }

  clear() {
    this.profilePicture = null;
    this.specializationIds = [];
    this.conditionIds = [];
    this.otherCondition = "";
    this.otherConditions = [];
    this.serviceAreaIds = [];
    this.feePerSession = null;
    this.gender = null;
  }

  getAll() {
    return {
      profilePicture: this.profilePicture,
      specializationIds: this.specializationIds,
      conditionIds: this.conditionIds,
      otherCondition: this.otherCondition,
      otherConditions: this.otherConditions,
      serviceAreaIds: this.serviceAreaIds,
      feePerSession: this.feePerSession,
      gender: this.gender,
    };
  }
}

export const therapistOnboardingStore = new TherapistOnboardingStore();
