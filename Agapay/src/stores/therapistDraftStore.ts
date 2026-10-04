export const DraftStore = {
  updatedSpecializations: null as number[] | null,
  updatedConditions: null as number[] | null,
  updatedServiceAreas: null as number[] | null,

  reset() {
    this.updatedSpecializations = null;
    this.updatedConditions = null;
    this.updatedServiceAreas = null;
  },

  getAndReset() {
    const data = {
      updatedSpecializations: this.updatedSpecializations,
      updatedConditions: this.updatedConditions,
      updatedServiceAreas: this.updatedServiceAreas,
    };
    this.reset();
    return data;
  },
};
