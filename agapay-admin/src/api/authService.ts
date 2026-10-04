import axios from 'axios'
import { apiClient } from './apiClient'

export interface LoginCredentials {
  email: string,
  password: string,
  deviceId?: string,
  deviceName?: string
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  userType: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export const login = async (
  credentials: LoginCredentials
): Promise<LoginResponse> => {
  try {
    const response = await apiClient.post<LoginResponse>(
      '/Auth/login',
      credentials
    )
    return response.data
  } catch (error) {
    if (axios.isAxiosError(error) && !error.response) {
      console.error(
        'Network Error: Could not connect to the API. Backend running? CORS policy issue?'
      )
    }
    throw error
  }
}