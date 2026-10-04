import { apiClient } from './apiClient'

export type ReportStatus = 'New' | 'Reviewing' | 'Resolved' | 'Dismissed'
export type ReportPriority = 'Low' | 'Medium' | 'High' | 'Critical'

export interface Report {
    id: number
    reporterUserId: string
    reporterName: string
    reporterEmail: string | null
    reportedUserId: string
    reportedName: string
    reportedEmail: string | null
    category: string
    notes: string | null
    status: ReportStatus
    priority: ReportPriority
    adminNotes: string | null
    resolutionSummary: string | null
    createdAt: string
    reviewedBy: string | null
    reviewedAt: string | null
}

export interface ReportStats {
    totalReports: number
    newReports: number
    reviewingReports: number
    resolvedReports: number
    dismissedReports: number
    reportsThisWeek: number
    reportsThisMonth: number
    highPriorityCount: number
    criticalCount: number
    averageResolutionTimeHours: number
    categoryBreakdown: { category: string; count: number }[]
}

export interface UserReportHistory {
    id: number
    reporterName: string
    category: string
    notes: string | null
    status: ReportStatus
    priority: ReportPriority
    createdAt: string
    reviewedAt: string | null
}

export interface UserDetails {
    id: string
    name: string
    email: string
    roles: string[]
    accountStatus: string
    suspensionReason: string | null
    suspendedAt: string | null
    suspendedUntil: string | null
    warningCount: number
    createdAt: string
}

export interface ReportFilters {
    search?: string
    status?: string
    priority?: string
    category?: string
    fromDate?: string
    toDate?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
}

export async function fetchReportStats(): Promise<ReportStats> {
    const response = await apiClient.get('/Admin/reports/stats')
    return response.data
}

export async function fetchReports(filters?: ReportFilters): Promise<Report[]> {
    const params = new URLSearchParams()
    if (filters?.search) params.append('search', filters.search)
    if (filters?.status) params.append('status', filters.status)
    if (filters?.priority) params.append('priority', filters.priority)
    if (filters?.category) params.append('category', filters.category)
    if (filters?.fromDate) params.append('fromDate', filters.fromDate)
    if (filters?.toDate) params.append('toDate', filters.toDate)
    if (filters?.sortBy) params.append('sortBy', filters.sortBy)
    if (filters?.sortOrder) params.append('sortOrder', filters.sortOrder)

    const response = await apiClient.get(`/Admin/reports?${params.toString()}`)
    return response.data
}

export async function fetchReportById(id: number): Promise<Report> {
    const response = await apiClient.get(`/Admin/reports/${id}`)
    return response.data
}

export async function updateReportStatus(id: number, status: ReportStatus, resolutionSummary?: string): Promise<void> {
    await apiClient.put(`/Admin/reports/${id}/status`, { status, resolutionSummary })
}

export async function updateReportPriority(id: number, priority: ReportPriority): Promise<void> {
    await apiClient.put(`/Admin/reports/${id}/priority`, { priority })
}

export async function updateReportNotes(id: number, adminNotes: string): Promise<void> {
    await apiClient.put(`/Admin/reports/${id}/notes`, { adminNotes })
}

export async function fetchUserReportHistory(userId: string): Promise<UserReportHistory[]> {
    const response = await apiClient.get(`/Admin/reports/user/${userId}/history`)
    return response.data
}

// User account management
export async function fetchUserDetails(userId: string): Promise<UserDetails> {
    const response = await apiClient.get(`/Admin/users/${userId}`)
    return response.data
}

export interface WarnUserResponse {
    message: string
    warningCount: number
    reason: string
    autoSuspended: boolean
    accountStatus: string
}

export async function warnUser(userId: string, reason: string): Promise<WarnUserResponse> {
    const response = await apiClient.post(`/Admin/users/${userId}/warn`, { reason })
    return response.data
}

export async function suspendUser(userId: string, reason: string, duration: string): Promise<void> {
    await apiClient.post(`/Admin/users/${userId}/suspend`, { reason, duration })
}

export async function banUser(userId: string, reason: string): Promise<void> {
    await apiClient.post(`/Admin/users/${userId}/ban`, { reason })
}

export async function restoreUser(userId: string): Promise<void> {
    await apiClient.post(`/Admin/users/${userId}/restore`)
}

export async function modifySuspension(userId: string, newDuration: string): Promise<void> {
    await apiClient.put(`/Admin/users/${userId}/modify-suspension`, { newDuration })
}
