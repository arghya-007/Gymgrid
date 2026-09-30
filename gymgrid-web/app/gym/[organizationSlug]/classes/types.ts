export interface ClassProgramOption {
  id: string;
  branchId: string;
  code: string;
  name: string;
  durationMinutes: number;
  defaultCapacity: number;
}

export interface TrainerOption {
  organizationUserId: string;
  name: string;
  scope: string;
}
