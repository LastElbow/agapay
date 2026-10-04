import apiClient from "@/api/client";

export type ContractStatus =
  | "Draft"
  | "PendingConfirmation"
  | "Active"
  | "Completed"
  | "Cancelled"
  | "Expired"
  | "Terminated"
  | string;

export type ContractDetailDto = {
  id: number;
  patientId: number;
  physicalTherapistId: number;
  startDate?: string | null;
  endDate?: string | null;
  status: ContractStatus;
  caseToTreat?: string | null;
  sessionDays?: string | null; // comma-separated
  sessionStartTime?: string | null; // HH:mm:ss
  sessionEndTime?: string | null; // HH:mm:ss
  professionalFee?: number | null;
  locationFee?: number | null;
  miscellaneousFee?: number | null;
  totalFee?: number | null;
  blueprintProposedAt?: string | null;
  blueprintConfirmedAt?: string | null;
  isAwaitingPatientConfirmation?: boolean | null;
};

export async function getContract(contractId: string | number): Promise<ContractDetailDto> {
  const res = await apiClient.get(`/api/contracts/${contractId}`);
  return res.data as ContractDetailDto;
}

export type RecurringCommitment = {
  contractId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  status: ContractStatus;
};

export type UpdateBlueprintRequest = Partial<{
  CaseToTreat: string;
  SessionDays: string;
  SessionStartTime: string; // HH:mm:ss
  SessionEndTime: string; // HH:mm:ss
  ProposedSessionDate: string; // ISO date string (YYYY-MM-DD or full ISO)
  ProfessionalFee: number;
  LocationFee: number;
  MiscellaneousFee: number;
  TotalFee: number;
}>;

export async function updateBlueprint(contractId: string | number, body: UpdateBlueprintRequest) {
  await apiClient.put(`/api/contracts/${contractId}/blueprint`, body);
}

export async function fetchRecurringCommitments(
  therapistId: number | string,
  options?: { excludeContractId?: number }
): Promise<RecurringCommitment[]> {
  const params =
    options?.excludeContractId != null
      ? { excludeContractId: options.excludeContractId }
      : undefined;
  const res = await apiClient.get(
    `/api/contracts/therapist/${therapistId}/recurring-commitments`,
    { params }
  );
  const list = Array.isArray(res?.data) ? (res.data as RecurringCommitment[]) : [];
  return list;
}

export async function sendForConfirmation(contractId: string | number) {
  await apiClient.post(`/api/contracts/${contractId}/send-for-confirmation`);
}

export async function confirmContract(contractId: string | number) {
  await apiClient.post(`/api/contracts/${contractId}/confirm`);
}

export type CreateContractRequest = {
  PatientId: number;
  PhysicalTherapistId: number;
  StartDate: string; // ISO string
  EndDate: string; // ISO string
};

export async function createContract(body: CreateContractRequest): Promise<{ id: number }> {
  const res = await apiClient.post(`/api/contracts`, body);
  const id = (res?.data?.id ?? res?.data?.Id) as number | undefined;
  if (!id) throw new Error("Failed to create contract");
  return { id };
}

export async function getContractsForPatient(patientId: number): Promise<
  { id: number; patientId: number; physicalTherapistId: number; startDate?: string; endDate?: string; status: string }[]
> {
  const res = await apiClient.get(`/api/contracts/patient/${patientId}`);
  return Array.isArray(res?.data) ? res.data : [];
}

export type EndContractRequest = {
  Status: "Completed" | "Terminated";
  Reason?: string;
};

export async function endContract(contractId: string | number, body: EndContractRequest) {
  await apiClient.post(`/api/contracts/${contractId}/end`, body);
}
