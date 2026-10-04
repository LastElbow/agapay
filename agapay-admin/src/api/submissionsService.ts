import axios from 'axios'
import { apiClient } from './apiClient'

export type SubmissionStatus = 'pending' | 'accepted' | 'rejected'

export interface Submission {
  id: string
  therapistName: string
  patientName: string
  submittedAt: string // ISO date
  notes?: string
  licensePreviewUrl?: string
  status: SubmissionStatus
}

// Backend verification shape (module-scoped so it's usable by multiple helpers)
interface BackendVerification {
  id: number | string
  userId?: string
  userName?: string
  email?: string
  licenseNumber?: string
  licenseImagePath?: string | null
  submittedAt?: string
  verificationStatus?: number
  licensePreviewUrl?: string | null
  status?: string
}

// Normalize a preview URL coming from the backend. If it's already an absolute URL
// (starts with http) we return it as-is. If the backend returned a relative/signing
// path like `object/sign/...` or `/object/sign/...` we attempt to expand it using
// the Vite env variable VITE_SUPABASE_URL (if present). This makes the client
// resilient to backends that sometimes return full URLs and sometimes return
// only the path portion.
function normalizePreviewUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined
  const trimmed = String(raw).trim()
  if (!trimmed) return undefined
  // already absolute
  if (/^https?:\/\//i.test(trimmed)) return trimmed

  // try to expand with Vite env variable if available
  const base = (import.meta.env && (import.meta.env.VITE_SUPABASE_URL as string | undefined)) || undefined
  if (base) {
    // ensure no duplicate slashes
    return `${base.replace(/\/+$/, '')}/${trimmed.replace(/^\/+/, '')}`
  }

  // no base available - return the raw value as a best-effort fallback
  return trimmed
}

export const fetchLicensePreviewUrl = async (
  therapistId: string
): Promise<string | undefined> => {
  try {
    const res = await apiClient.get<{ url: string }>(
      `/Admin/submissions/${therapistId}/license-url`
    )
    return normalizePreviewUrl(res.data?.url ?? undefined)
  } catch (err) {
    console.warn(
      "[submissionsService] failed to fetch license preview URL",
      therapistId,
      err
    )
    return undefined
  }
}

export const fetchSubmissions = async (): Promise<Submission[]> => {
  // The backend exposes admin submissions at /Admin/submissions
  try {
    const res = await apiClient.get<BackendVerification[]>('/Admin/submissions')
    // Map the API shape into our UI Submission shape
    const mapped: Submission[] = (res.data || []).map((item) => {
      // API returns a string status like 'Pending' / 'Verified' / 'Rejected'
      const raw = (item.status || '').toString().toLowerCase()
      let status: SubmissionStatus = 'pending'
      if (raw.includes('verif') || raw.includes('accept')) status = 'accepted'
      else if (raw.includes('reject')) status = 'rejected'

      return {
        id: String(item.id),
        therapistName: item.userName || item.userId || 'Unknown Therapist',
        // use email as the secondary field
        patientName: item.email || '',
        submittedAt: item.submittedAt || new Date().toISOString(),
        notes: item.licenseNumber ? `License: ${item.licenseNumber}` : item.licenseImagePath || item.licensePreviewUrl || undefined,
        licensePreviewUrl: normalizePreviewUrl((item as unknown as { signedUrl?: string }).signedUrl || item.licensePreviewUrl || undefined),
        status,
      }
    })

    return mapped
  } catch (err) {
    // throw a richer error that includes status when possible
    if (axios.isAxiosError(err) && err.response) {
      const status = err.response.status
      const msg = (err.response.data && (err.response.data.message || err.response.data.error)) || err.message
      throw new Error(`API ${status}: ${String(msg)}`)
    }
    throw err
  }
}

// Fetch a single submission by therapist id (admin route)
export const fetchSubmissionByTherapist = async (
  therapistId: string
): Promise<Submission> => {
  const res = await apiClient.get<BackendVerification>(`/Admin/submissions/${therapistId}`)
  const item = res.data
  const raw = (item.status || '').toString().toLowerCase()
  let status: SubmissionStatus = 'pending'
  if (raw.includes('verif') || raw.includes('accept')) status = 'accepted'
  else if (raw.includes('reject')) status = 'rejected'

  let previewUrl = normalizePreviewUrl(
    (item as unknown as { signedUrl?: string }).signedUrl ||
    item.licensePreviewUrl ||
    undefined
  )

  if (!previewUrl) {
    previewUrl = await fetchLicensePreviewUrl(String(item.id))
  }

  return {
    id: String(item.id),
    therapistName: item.userName || item.userId || 'Unknown Therapist',
    patientName: item.email || '',
    submittedAt: item.submittedAt || new Date().toISOString(),
    notes: item.licenseNumber ? `License: ${item.licenseNumber}` : item.licenseImagePath || item.licensePreviewUrl || undefined,
    // Prefer a signedUrl returned by the backend (field may be named `signedUrl` or `licensePreviewUrl`)
    licensePreviewUrl: previewUrl,
    status,
  }
}

// Admin accept/reject actions that target a therapist's submission
export const acceptSubmissionByTherapist = async (therapistId: string): Promise<void> => {
  // legacy route kept for compatibility — prefer using verify endpoint
  await verifySubmissionByTherapist(therapistId, true, null)
}

export const rejectSubmissionByTherapist = async (therapistId: string): Promise<void> => {
  // legacy route kept for compatibility — prefer using verify endpoint
  await verifySubmissionByTherapist(therapistId, false, null)
}

// New: use the admin verification endpoint that accepts { isApproved, rejectionReason }
export const verifySubmissionByTherapist = async (
  therapistId: string,
  isApproved: boolean,
  rejectionReason: string | null
): Promise<void> => {
  await apiClient.post(`/Admin/therapist-verifications/${therapistId}/verify`, {
    isApproved,
    rejectionReason,
  })
}

// Backwards-compatible generic functions (left in place but point to admin routes)
export const acceptSubmission = async (id: string): Promise<void> => {
  await acceptSubmissionByTherapist(id)
}

export const rejectSubmission = async (id: string): Promise<void> => {
  await rejectSubmissionByTherapist(id)
}

// export a small mock used by UI when the API is unreachable
export const mockSubmissions = (): Submission[] => [
  {
    id: 'sub_1',
    therapistName: 'John Doe PT',
    patientName: 'Alice Smith',
    submittedAt: new Date().toISOString(),
    notes: 'Patient reported decreased mobility in left shoulder.',
    status: 'pending',
  },
  {
    id: 'sub_2',
    therapistName: 'Jane Roe PT',
    patientName: 'Bob Johnson',
    submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    notes: 'Follow-up required for gait training.',
    status: 'pending',
  },
]
