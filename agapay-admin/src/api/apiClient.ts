import axios from 'axios'
import type { AxiosRequestHeaders, InternalAxiosRequestConfig } from 'axios'

// Centrally managed base URL.
// Defaults to the live cloud backend (Railway) so the app works immediately out of the box when cloned from GitHub.
// Local development can override this by setting VITE_API_URL in a local .env file.
const baseURL = import.meta.env.VITE_API_URL || 'https://agapay-backend-production.up.railway.app/api'

export const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true'
  }
})

// Attach the stored JWT auth token to every request automatically
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = sessionStorage.getItem('authToken')
  if (token) {
    const current = (config.headers || {}) as Record<string, unknown>
    const hasAuth = Object.keys(current).some((k) => k.toLowerCase() === 'authorization')
    if (!hasAuth) {
      config.headers = {
        ...current,
        Authorization: `Bearer ${token}`,
      } as AxiosRequestHeaders
    }
  }
  return config
})
