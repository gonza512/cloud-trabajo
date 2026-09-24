import axios from 'axios'
import type { Patient, ApiResponseDTO } from '../types/patient'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'
const API_URL = `${BASE_URL.replace(/\/$/, '')}/api/v1/patients`

const AUTHORITY =
  import.meta.env.VITE_COGNITO_AUTHORITY ||
  'https://cognito-idp.us-east-1.amazonaws.com/REEMPLAZAR_POOL_ID'
const CLIENT_ID =
  import.meta.env.VITE_COGNITO_CLIENT_ID || 'REEMPLAZAR_CLIENT_ID'

const getAuthHeaders = () => {
  const oidcStorageKey = `oidc.user:${AUTHORITY}:${CLIENT_ID}`
  const oidcData =
    localStorage.getItem(oidcStorageKey) ||
    sessionStorage.getItem(oidcStorageKey)

  if (oidcData) {
    try {
      const user = JSON.parse(oidcData)
      const token = user.id_token || user.access_token
      if (token) {
        return {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      }
    } catch (e) {
      console.error('Error al parsear el token de Cognito', e)
    }
  }

  console.warn('No se encontró el token de Cognito en storage.')
  return {}
}

export const getPatients = async (): Promise<Patient[]> => {
  const response = await axios.get<ApiResponseDTO<Patient[]>>(
    API_URL,
    getAuthHeaders(),
  )
  if (response.status === 204) return []
  return response.data.data || []
}

export const createPatient = async (
  patientData: Patient,
): Promise<Patient> => {
  const response = await axios.post<ApiResponseDTO<Patient>>(
    API_URL,
    patientData,
    getAuthHeaders(),
  )
  return response.data.data
}

export const updatePatient = async (
  id: number,
  patientData: Patient,
): Promise<Patient> => {
  const response = await axios.put<ApiResponseDTO<Patient>>(
    `${API_URL}/${id}`,
    patientData,
    getAuthHeaders(),
  )
  return response.data.data
}
