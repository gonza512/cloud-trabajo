# DSY1107 — Hospital Cloud Native (AWS)

Adaptación del encargo (Azure AD / MSAL / API Manager) a **AWS Academy Learner Lab**, usando los repos base del curso:

- Front: https://github.com/breadsk/frontHospital2R  
- Back: https://github.com/breadsk/hospital-k8  

**Región:** `us-east-1` · **Cuenta lab:** `786373142303`

---

## Equivalencia Azure → AWS (lo que pide el profe)

| Encargo (Azure / rúbrica) | Implementación AWS |
|---------------------------|--------------------|
| Tenant IDaaS | Cognito **User Pool** `HospitalUserPool-DSY1107` |
| App registration + MSAL | App Client **HospitalFront** + OIDC |
| Flujo OAuth | **Authorization Code + PKCE** (`react-oidc-context`) |
| API Manager | **API Gateway** HTTP API + authorizer JWT + CORS |
| Backend + validación JWT | Spring Boot OAuth2 Resource Server en **EC2** |
| BD cloud | **RDS MySQL** (Aurora denegado por política `Pvoclabs2` del lab) |
| Frontend | React + Vite en `localhost:5173` → consume API Gateway |

---

## Estado vs rúbrica

### EP1 — Encargo (código)

| Indicador | Estado |
|-----------|--------|
| Login OIDC / tokens en el front | Hecho (PKCE + Cognito Hosted UI) |
| JWT adjunto en llamadas al API | Hecho |
| Backend valida JWT (issuer / firma) | Hecho (`SecurityConfig`) |
| Integración con BD cloud (JPA + props) | Hecho (RDS MySQL) |
| Entrega GitHub (front + back + `.gitignore`) | Pendiente: subir este repo y pegar enlaces en AVA |

### EP2 — Presentación (demo en consola)

| Indicador (rúbrica) | Peso | Estado |
|---------------------|------|--------|
| Rutas API Manager → backend | 13% | Hecho (`/api/v1/{proxy+}` GET/POST/PUT/DELETE/OPTIONS) |
| CORS hacia el frontend | 7% | Hecho (`http://localhost:5173`) |
| Tenant IDaaS + usuarios | 10% | Hecho (User Pool + `alumno@duocuc.cl`) |
| App en el tenant (clientId, callbacks, scopes) | 10% | Hecho |
| Flujo registro / login + tokens | 10% | Login hecho; registro self-service opcional en Cognito |
| Authorization Code + PKCE | 15% | Hecho |
| JWT en todas las rutas (200 / 401) | 20% | Hecho (sin token → 401) |
| Evidencias de rutas + JSON del backend | 15% | Hecho (capturas + demo front) |

### Qué falta / mejorar para “muy buen desempeño”

1. **Subir a GitHub** y entregar enlaces (EP1 formal).  
2. En la presentación, mostrar en vivo:  
   - curl/API Gateway **sin token → 401** y **con token → 200**  
   - Cognito User Pool / App Client / dominio  
   - RDS Available + EC2 Running  
   - Front listando pacientes vía Gateway  
3. Opcional rúbrica “roles/claims”: grupos Cognito + autorización por rol (hoy basta JWT válido).  
4. Opcional: desplegar el **front** también en nube (S3/CloudFront). Hoy el front corre en local; el back sí está en EC2 (aceptable en lab Academy).  
5. Nota: el PDF habla de Angular/Pedidos360; el curso/profe pidió **estos repos React + Hospital** en **AWS**.

---

## Arquitectura desplegada

```
Browser (localhost:5173)
    │  OIDC PKCE
    ▼
Cognito Hosted UI  ──JWT──►  Front adjunta Authorization
    │
    ▼
API Gateway HTTP (prod)
  • Authorizer JWT Cognito
  • CORS localhost:5173
  • Rutas /api/v1/{proxy+}
    │
    ▼
EC2 t3.micro :8080  (Spring Boot hospital.jar, Java 21)
    │
    ▼
RDS MySQL 8  db_hospital_vm
```

---

## IDs del lab (us-east-1)

| Recurso | Valor |
|---------|--------|
| User Pool | `us-east-1_7yYrEJl8g` |
| App Client | `1g7gh607pfmd9qpjtqls234h8o` |
| Dominio Cognito | `https://hospital-dsy1107-14303.auth.us-east-1.amazoncognito.com` |
| Issuer / Authority | `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_7yYrEJl8g` |
| Usuario prueba | `alumno@duocuc.cl` / `Hospital123!` |
| RDS | `hospital-dsy1107-mysql` |
| Endpoint RDS | `hospital-dsy1107-mysql.ctbzhktilybp.us-east-1.rds.amazonaws.com:3306` |
| DB | `db_hospital_vm` · user `hospitaladmin` |
| SG DB | `sg-0b901b0c1c8581427` (TCP 3306) |
| EC2 | `i-0df3b726de01fc4a7` · `hospital-dsy1107-api` · IP `34.229.82.193` |
| SG EC2 | `sg-0535029db9e856ea1` (22 + 8080) |
| API Gateway | `31ayxcki45` |
| API URL | `https://31ayxcki45.execute-api.us-east-1.amazonaws.com/prod` |

Credenciales detalladas (lab): `scripts/aws-outputs.env` (**no subir a GitHub público**).

---

## Estructura del repo

```
front/          React + Vite + OIDC PKCE
backend/        Spring Boot + JWT Cognito + JPA
capturas/       Evidencias consola AWS / demo
informe/        Informe + checklist capturas
scripts/        Pasos CLI Learner Lab (provision / APIGW / EC2)
```

---

## Configuración para que funcione

Los secretos **no** van a GitHub (`.gitignore`). Al clonar o en otra PC, créalos así:

### 1) Frontend — `front/.env`

```powershell
cd front
copy .env.example .env
```

Contenido (ya viene en `.env.example`):

```env
VITE_COGNITO_AUTHORITY=https://cognito-idp.us-east-1.amazonaws.com/us-east-1_7yYrEJl8g
VITE_COGNITO_CLIENT_ID=1g7gh607pfmd9qpjtqls234h8o
VITE_COGNITO_DOMAIN=https://hospital-dsy1107-14303.auth.us-east-1.amazoncognito.com
VITE_API_URL=https://31ayxcki45.execute-api.us-east-1.amazonaws.com/prod
```

### 2) Backend local — `application.properties`

```powershell
cd backend\src\main\resources
copy application.properties.example application.properties
```

Ahí quedan: JDBC de RDS, Cognito `issuer-uri` y CORS a `localhost:5173`.

### 3) Usuario de demo Cognito

- Email: `alumno@duocuc.cl`
- Password: `Hospital123!`

### 4) Backend en la nube

Ya corre en EC2 (`hospital-dsy1107-api`); el front **no** necesita backend local si `VITE_API_URL` apunta al API Gateway.

---

## Cómo correr (demo)

### Frontend

```bash
cd front
npm install
npm run dev
# http://localhost:5173 → Iniciar sesión → Cognito
```

### Backend (solo si quieres local; opcional)

```bash
cd backend
# Windows: copy src\main\resources\application.properties.example src\main\resources\application.properties
./mvnw spring-boot:run
```

### Pruebas rúbrica (API Gateway)

```bash
# Sin token → 401
curl -s -o /dev/null -w "%{http_code}\n" \
  https://31ayxcki45.execute-api.us-east-1.amazonaws.com/prod/api/v1/patients

# Con token (id_token de Cognito tras login) → 200
curl -s -H "Authorization: Bearer <ID_TOKEN>" \
  https://31ayxcki45.execute-api.us-east-1.amazonaws.com/prod/api/v1/patients
```

---

## Capturas (evidencias)

Carpeta exacta:

`C:\Users\ignac\Projects\dsy1107-hospital-aws\capturas`

| Archivo | Evidencia |
|---------|-----------|
| `01-cognito-overview.png` | User Pool / Tenant |
| `02-cognito-app-clients.png` | App Client + Client ID |
| `03-cognito-login-pages-oidc.png` | Callbacks + Auth Code + scopes |
| `04-cognito-domain.png` | Dominio Hosted UI |
| `05-cognito-users.png` | Usuario Confirmado |
| `06-rds-databases.png` | RDS Available |
| `07-rds-detail-connectivity.png` | Endpoint / puerto |
| `08-sg-db-inbound-3306.png` | SG MySQL |
| `09-apigateway-routes.png` | Rutas API Gateway |
| `10-apigateway-get-jwt-authorizer.png` | Authorizer JWT en GET |
| `11-ec2-instance-api.png` | Backend en EC2 |
| `12-cognito-hosted-ui-login.png` | Login OIDC |
| `13-frontend-pacientes.png` | Front autenticado + JSON pacientes |
| `14-frontend-oauth-redirect-code.png` | Demo post-login |

Checklist detallado: `informe/CHECKLIST_CAPTURAS.md`  
Informe: `informe/INFORME_EP_AWS_HOSPITAL.md`

---

## Guion corto de presentación (5–10 min)

1. **Arquitectura** Azure→AWS (tabla de equivalencias).  
2. **Cognito**: Pool, App Client, dominio, usuario. Login Hosted UI.  
3. **API Gateway**: rutas, CORS, authorizer JWT → demo 401 sin token.  
4. **EC2 + RDS**: instancia Running + BD Available.  
5. **Front**: login → listado de pacientes vía Gateway (200).  
6. **Código**: front OIDC PKCE + back Resource Server.

---

## Scripts del lab

Si hay que reprovisionar en la terminal del Learner Lab:

- `scripts/PASOS_APIGW_EC2.md` — EC2 + API Gateway  
- `scripts/aws-outputs.env` — outputs actuales (secretos)

---

## Nota Aurora

El lab bloquea `rds:CreateDBInstance` sobre Aurora (`AccessDenied` / policy `Pvoclabs2`).  
Se usó **RDS MySQL `db.t3.micro`** como BD cloud equivalente; documentarlo en la presentación.
