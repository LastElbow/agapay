import apiClient from "@/api/client";
import {
  createContract,
  fetchRecurringCommitments,
  getContract,
  getContractsForPatient,
  updateBlueprint,
} from "@/src/services/contracts";

jest.mock("@/api/client", () => {
  const api = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    defaults: { baseURL: "https://example.test/api", headers: { common: {} } },
  };
  return { __esModule: true, default: api };
});

describe("src/services/contracts", () => {
  const api = apiClient as unknown as {
    get: jest.Mock;
    post: jest.Mock;
    put: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("getContract hits the expected endpoint", async () => {
    api.get.mockResolvedValueOnce({ data: { id: 123, status: "Draft", patientId: 1, physicalTherapistId: 2 } });
    const res = await getContract(123);
    expect(api.get).toHaveBeenCalledWith("/api/contracts/123");
    expect(res.id).toBe(123);
  });

  it("updateBlueprint PUTs body to /blueprint", async () => {
    api.put.mockResolvedValueOnce({ data: {} });
    await updateBlueprint(5, { CaseToTreat: "x" });
    expect(api.put).toHaveBeenCalledWith("/api/contracts/5/blueprint", { CaseToTreat: "x" });
  });

  describe("createContract", () => {
    it("extracts id from data.id", async () => {
      api.post.mockResolvedValueOnce({ data: { id: 77 } });
      await expect(
        createContract({ PatientId: 1, PhysicalTherapistId: 2, StartDate: "s", EndDate: "e" })
      ).resolves.toEqual({ id: 77 });
    });

    it("extracts id from data.Id", async () => {
      api.post.mockResolvedValueOnce({ data: { Id: 88 } });
      await expect(
        createContract({ PatientId: 1, PhysicalTherapistId: 2, StartDate: "s", EndDate: "e" })
      ).resolves.toEqual({ id: 88 });
    });

    it("throws if backend does not return id", async () => {
      api.post.mockResolvedValueOnce({ data: {} });
      await expect(
        createContract({ PatientId: 1, PhysicalTherapistId: 2, StartDate: "s", EndDate: "e" })
      ).rejects.toThrow("Failed to create contract");
    });
  });

  it("fetchRecurringCommitments passes excludeContractId as query param", async () => {
    api.get.mockResolvedValueOnce({ data: [] });
    await fetchRecurringCommitments(9, { excludeContractId: 123 });
    expect(api.get).toHaveBeenCalledWith(
      "/api/contracts/therapist/9/recurring-commitments",
      { params: { excludeContractId: 123 } }
    );
  });

  it("getContractsForPatient returns [] on non-array", async () => {
    api.get.mockResolvedValueOnce({ data: { items: [] } });
    await expect(getContractsForPatient(1)).resolves.toEqual([]);
  });
});
