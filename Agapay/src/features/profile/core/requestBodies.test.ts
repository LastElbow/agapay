import {
  buildUpdatePatientProfileBody,
  buildUpdateTherapistProfileBody,
} from './requestBodies';

describe('profile request bodies', () => {
  describe('buildUpdatePatientProfileBody', () => {
    it('trims names and normalizes date input', () => {
      const body = buildUpdatePatientProfileBody({
        firstName: '  Jane  ',
        lastName: '  Doe ',
        dateOfBirth: '03/17/1998',
        relationshipToUser: ' Self ',
        gender: 'f',
      });

      expect(body).toEqual({
        firstName: 'Jane',
        lastName: 'Doe',
        dateOfBirth: '1998-03-17',
        relationshipToUser: 'Self',
        gender: 'Female',
      });
    });

    it('sends null for gender when explicitly provided empty', () => {
      const body = buildUpdatePatientProfileBody({ gender: '   ' });
      expect(body).toEqual({ gender: null });
    });

    it('includes address and location only when provided/finite', () => {
      const body = buildUpdatePatientProfileBody({
        address: '  ',
        barangay: 'B1',
        latitude: 14.5,
        longitude: Number.NaN,
      });

      expect(body).toEqual({
        address: null,
        barangay: 'B1',
        latitude: 14.5,
      });
    });
  });

  describe('buildUpdateTherapistProfileBody', () => {
    it('maps legacy serviceAreaIds/serviceAreas to serviceAreasIds', () => {
      const body1 = buildUpdateTherapistProfileBody({
        serviceAreaIds: [1, 2, 3],
      });
      expect(body1).toEqual({ serviceAreasIds: [1, 2, 3] });

      const body2 = buildUpdateTherapistProfileBody({
        serviceAreas: [{ id: 9 }, { id: 10 }],
      });
      expect(body2).toEqual({ serviceAreasIds: [9, 10] });
    });

    it('maps object arrays to *Ids fields and trims scalars', () => {
      const body = buildUpdateTherapistProfileBody({
        firstName: '  Alex ',
        lastName: ' Smith  ',
        dateOfBirth: '1990-01-02T10:20:30Z',
        gender: ' M ',
        otherConditions: '  asthma  ',
        feePerSession: '1500',
        specializations: [{ id: 1 }],
        conditions: [{ id: 2 }, { id: 3 }],
        serviceAreas: [{ id: 4 }],
      });

      expect(body).toEqual({
        firstName: 'Alex',
        lastName: 'Smith',
        dateOfBirth: '1990-01-02',
        gender: 'Male',
        feePerSession: 1500,
        otherConditions: 'asthma',
        specializationIds: [1],
        conditionIds: [2, 3],
        serviceAreasIds: [4],
      });
    });

    it('sends null to clear otherConditions when provided empty', () => {
      const body = buildUpdateTherapistProfileBody({ otherConditions: '  ' });
      expect(body).toEqual({ otherConditions: null });
    });
  });
});
