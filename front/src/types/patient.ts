export interface Patient {
  id?: number;
  rut: string;
  dv?: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  email: string;
}

export interface ApiResponseDTO<T> {
  ok: boolean;
  statusCode: number;
  message: string;
  data: T;
  count: number;
}