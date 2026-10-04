import { apiClient } from './apiClient'

export interface OtherCondition {
  id: number
  name: string
  status: 'Pending' | 'Verified'
  createdAt: string
  updatedAt: string
  therapistCount: number
}

export interface UpdateConditionDto {
  name?: string
  status?: 'Pending' | 'Verified'
}

export interface MergeConditionsDto {
  sourceConditionId: number
  destinationConditionId: number
}

export const fetchConditions = async (status?: string): Promise<OtherCondition[]> => {
  const params = status ? { status } : {}
  const res = await apiClient.get<OtherCondition[]>('/admin/conditions', { params })
  return res.data || []
}

export const updateCondition = async (id: number, dto: UpdateConditionDto): Promise<void> => {
  await apiClient.put(`/admin/conditions/${id}`, dto)
}

export const deleteCondition = async (id: number): Promise<void> => {
  await apiClient.delete(`/admin/conditions/${id}`)
}

export const mergeConditions = async (dto: MergeConditionsDto): Promise<void> => {
  await apiClient.post('/admin/conditions/merge', dto)
}

// Fetch all verified conditions for the merge destination search
export const fetchVerifiedConditions = async (): Promise<OtherCondition[]> => {
  const res = await apiClient.get<OtherCondition[]>('/admin/conditions', {
    params: { status: 'Verified' }
  })
  return res.data || []
}
