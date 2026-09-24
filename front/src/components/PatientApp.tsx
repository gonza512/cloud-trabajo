import React, { useState, useEffect } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import type { Patient } from '../types/patient';
import { getPatients, createPatient, updatePatient } from '../services/patientService';

const initialFormState: Patient = {
  rut: '',
  firstName: '',
  lastName: '',
  birthDate: '',
  email: ''
};

export const PatientApp: React.FC = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [formData, setFormData] = useState<Patient>(initialFormState);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const data = await getPatients();
      setPatients(data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al conectar con la API.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // 1. El input type="date" siempre guarda en formato "YYYY-MM-DD"
    // Añadimos 'T00:00:00' para forzar la lectura en hora local de inicio de día
    const parsedDate = new Date(`${formData.birthDate}T00:00:00`);

    // 2. Validar que sea una fecha real
    if (isNaN(parsedDate.getTime())) {
      setError('Por favor selecciona una fecha de nacimiento válida.');
      return;
    }

    // 3. Crear el payload ajustado
    const payload: Patient = {
      ...formData,
      birthDate: parsedDate.toISOString()
    };

    try {
      if (isEditing && formData.id) {
        await updatePatient(formData.id, payload);
        setSuccess('Paciente actualizado correctamente.');
      } else {
        await createPatient(payload);
        setSuccess('Paciente registrado correctamente.');
      }
      setFormData(initialFormState);
      setIsEditing(false);
      fetchPatients();
    } catch (err: any) {
      // Captura el mensaje detallado enviado por Spring Boot en ApiResponseDTO
      const backendMessage = err.response?.data?.message;
      setError(backendMessage || 'Ocurrió un error al guardar los datos.');
    }
  };

  const handleEdit = (patient: Patient) => {
    setFormData({
      id: patient.id,
      rut: patient.rut,
      firstName: patient.firstName,
      lastName: patient.lastName,
      birthDate: patient.birthDate ? patient.birthDate.split('T')[0] : '',
      email: patient.email
    });
    setIsEditing(true);
    setError('');
    setSuccess('');
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormData(initialFormState);
    setError('');
    setSuccess('');
  };

  return (
    <div className="container my-5">
      <div className="text-center mb-4">
        <h1 className="fw-bold text-primary">Sistema Hospitalario</h1>
        <p className="text-muted">Gestión de Pacientes con React + TypeScript</p>
      </div>

      {/* Menajes de respuesta */}
      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Formulario con estilos Bootstrap */}
      <div className="card shadow-sm mb-5 border-0">
        <div className={`card-header text-white ${isEditing ? 'bg-warning text-dark' : 'bg-primary'}`}>
          <h5 className="mb-0">{isEditing ? '✏️ Editar Paciente' : '➕ Registrar Nuevo Paciente'}</h5>
        </div>
        <div className="card-body p-4">
          <form onSubmit={handleSubmit}>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label fw-bold">RUT (Ej: 12345678-9)</label>
                <input
                  type="text"
                  className="form-control"
                  name="rut"
                  placeholder="12345678-9"
                  pattern="^[0-9]{7,8}-[0-9kK]{1}$"
                  title="Formato requerido: 12345678-9"
                  value={formData.rut}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="col-md-6">
                <label className="form-label fw-bold">Correo Electrónico</label>
                <input
                  type="email"
                  className="form-control"
                  name="email"
                  placeholder="correo@ejemplo.com"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="col-md-4">
                <label className="form-label fw-bold">Nombre</label>
                <input
                  type="text"
                  className="form-control"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="col-md-4">
                <label className="form-label fw-bold">Apellido</label>
                <input
                  type="text"
                  className="form-control"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="col-md-4">
                <label className="form-label fw-bold">Fecha de Nacimiento</label>
                <input
                  type="date"
                  className="form-control"
                  name="birthDate"
                  value={formData.birthDate}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="col-12 mt-4 d-flex gap-2">
                <button type="submit" className={`btn ${isEditing ? 'btn-warning' : 'btn-success'} px-4`}>
                  {isEditing ? 'Guardar Cambios' : 'Registrar Paciente'}
                </button>
                {isEditing && (
                  <button type="button" className="btn btn-secondary px-4" onClick={handleCancel}>
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Tabla de Pacientes */}
      <div className="card shadow-sm border-0">
        <div className="card-header bg-dark text-white d-flex justify-content-between align-items-center">
          <h5 className="mb-0">📋 Listado de Pacientes</h5>
          <button className="btn btn-sm btn-outline-light" onClick={fetchPatients}>
            🔄 Actualizar
          </button>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>ID</th>
                  <th>RUT</th>
                  <th>Nombre Completo</th>
                  <th>Fecha Nacimiento</th>
                  <th>Email</th>
                  <th className="text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-4">
                      <div className="spinner-border text-primary" role="status"></div>
                    </td>
                  </tr>
                ) : patients.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-muted py-4">
                      No hay pacientes registrados actualmente.
                    </td>
                  </tr>
                ) : (
                  patients.map((p) => (
                    <tr key={p.id}>
                      <td className="fw-bold">{p.id}</td>
                      <td><code>{p.rut}</code></td>
                      <td>{`${p.firstName} ${p.lastName}`}</td>
                      <td>{p.birthDate ? new Date(p.birthDate).toLocaleDateString() : 'N/A'}</td>
                      <td>{p.email}</td>
                      <td className="text-center">
                        <button className="btn btn-sm btn-outline-primary" onClick={() => handleEdit(p)}>
                          ✏️ Editar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};