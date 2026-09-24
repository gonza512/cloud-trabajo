#!/usr/bin/env bash
# Provision DSY1107 Hospital stack en AWS Academy Learner Lab (us-east-1)
# Ejecutar en la terminal del Learner Lab (ya tiene AWS CLI configurado).
set -euo pipefail

REGION="us-east-1"
PREFIX="hospital-dsy1107"
DB_NAME="db_hospital_vm"
DB_USER="hospitaladmin"
DB_PASS="HospitalAdmin123!"   # cámbiala después; cumple política RDS
COGNITO_DOMAIN_PREFIX="hospital-dsy1107-$(date +%s | tail -c 6)"

echo "==> Identidad"
aws sts get-caller-identity --region "$REGION"

echo "==> 1) Security Group para Aurora/RDS (3306)"
VPC_ID=$(aws ec2 describe-vpcs --region "$REGION" --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
SG_ID=$(aws ec2 create-security-group \
  --region "$REGION" \
  --group-name "${PREFIX}-db-sg" \
  --description "MySQL/Aurora for hospital lab" \
  --vpc-id "$VPC_ID" \
  --query 'GroupId' --output text 2>/dev/null || \
  aws ec2 describe-security-groups --region "$REGION" --filters Name=group-name,Values="${PREFIX}-db-sg" --query 'SecurityGroups[0].GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --region "$REGION" \
  --group-id "$SG_ID" \
  --protocol tcp --port 3306 --cidr 0.0.0.0/0 2>/dev/null || true
echo "SG=$SG_ID VPC=$VPC_ID"

echo "==> 2) Intentar Aurora MySQL Serverless v2; si falla, RDS MySQL db.t3.micro"
SUBNETS=$(aws ec2 describe-subnets --region "$REGION" --filters Name=vpc-id,Values="$VPC_ID" --query 'Subnets[*].SubnetId' --output text)
SUBNET_ARR=($SUBNETS)
SUBNET_GROUP="${PREFIX}-subnet-group"

aws rds create-db-subnet-group \
  --region "$REGION" \
  --db-subnet-group-name "$SUBNET_GROUP" \
  --db-subnet-group-description "Hospital lab subnets" \
  --subnet-ids "${SUBNET_ARR[0]}" "${SUBNET_ARR[1]}" 2>/dev/null || true

AURORA_OK=0
if aws rds create-db-cluster \
  --region "$REGION" \
  --db-cluster-identifier "${PREFIX}-aurora" \
  --engine aurora-mysql \
  --engine-version 8.0.mysql_aurora.3.04.0 \
  --master-username "$DB_USER" \
  --master-user-password "$DB_PASS" \
  --database-name "$DB_NAME" \
  --vpc-security-group-ids "$SG_ID" \
  --db-subnet-group-name "$SUBNET_GROUP" \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=1 \
  --storage-encrypted 2>/tmp/aurora_err.txt; then
  AURORA_OK=1
  aws rds create-db-instance \
    --region "$REGION" \
    --db-instance-identifier "${PREFIX}-aurora-i1" \
    --db-cluster-identifier "${PREFIX}-aurora" \
    --db-instance-class db.serverless \
    --engine aurora-mysql || true
  echo "Aurora cluster solicitado."
else
  echo "Aurora no permitido en este lab. Fallback a RDS MySQL..."
  cat /tmp/aurora_err.txt || true
  aws rds create-db-instance \
    --region "$REGION" \
    --db-instance-identifier "${PREFIX}-mysql" \
    --db-instance-class db.t3.micro \
    --engine mysql \
    --engine-version 8.0 \
    --master-username "$DB_USER" \
    --master-user-password "$DB_PASS" \
    --allocated-storage 20 \
    --db-name "$DB_NAME" \
    --vpc-security-group-ids "$SG_ID" \
    --db-subnet-group-name "$SUBNET_GROUP" \
    --publicly-accessible \
    --backup-retention-period 0 \
    --no-multi-az \
    --storage-type gp2
  echo "RDS MySQL solicitado."
fi

echo "==> 3) Cognito User Pool + App Client (OIDC PKCE)"
POOL_ID=$(aws cognito-idp create-user-pool \
  --region "$REGION" \
  --pool-name "HospitalUserPool-DSY1107" \
  --auto-verified-attributes email \
  --username-attributes email \
  --policies "PasswordPolicy={MinimumLength=8,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=false}" \
  --mfa-configuration OFF \
  --query 'UserPool.Id' --output text)

CLIENT_ID=$(aws cognito-idp create-user-pool-client \
  --region "$REGION" \
  --user-pool-id "$POOL_ID" \
  --client-name "HospitalFront" \
  --no-generate-secret \
  --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --supported-identity-providers COGNITO \
  --callback-urls "http://localhost:5173" \
  --logout-urls "http://localhost:5173" \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile phone \
  --allowed-o-auth-flows-user-pool-client \
  --prevent-user-existence-errors ENABLED \
  --query 'UserPoolClient.ClientId' --output text)

aws cognito-idp create-user-pool-domain \
  --region "$REGION" \
  --domain "$COGNITO_DOMAIN_PREFIX" \
  --user-pool-id "$POOL_ID"

aws cognito-idp admin-create-user \
  --region "$REGION" \
  --user-pool-id "$POOL_ID" \
  --username "alumno@duocuc.cl" \
  --user-attributes Name=email,Value=alumno@duocuc.cl Name=email_verified,Value=true \
  --temporary-password "TempPass123!" \
  --message-action SUPPRESS || true

aws cognito-idp admin-set-user-password \
  --region "$REGION" \
  --user-pool-id "$POOL_ID" \
  --username "alumno@duocuc.cl" \
  --password "Hospital123!" \
  --permanent || true

echo "==> 4) Esperar endpoint de BD (puede demorar 5-10 min)"
if [[ "$AURORA_OK" == "1" ]]; then
  aws rds wait db-cluster-available --region "$REGION" --db-cluster-identifier "${PREFIX}-aurora" || true
  DB_HOST=$(aws rds describe-db-clusters --region "$REGION" --db-cluster-identifier "${PREFIX}-aurora" --query 'DBClusters[0].Endpoint' --output text)
else
  aws rds wait db-instance-available --region "$REGION" --db-instance-identifier "${PREFIX}-mysql"
  DB_HOST=$(aws rds describe-db-instances --region "$REGION" --db-instance-identifier "${PREFIX}-mysql" --query 'DBInstances[0].Endpoint.Address' --output text)
fi

cat <<EOF

========== RESULTADOS ==========
REGION=$REGION
DB_HOST=$DB_HOST
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASS=$DB_PASS
JDBC=jdbc:mysql://${DB_HOST}:3306/${DB_NAME}?useSSL=true&allowPublicKeyRetrieval=true

COGNITO_POOL_ID=$POOL_ID
COGNITO_CLIENT_ID=$CLIENT_ID
COGNITO_AUTHORITY=https://cognito-idp.${REGION}.amazonaws.com/${POOL_ID}
COGNITO_DOMAIN=https://${COGNITO_DOMAIN_PREFIX}.auth.${REGION}.amazoncognito.com
COGNITO_USER=alumno@duocuc.cl
COGNITO_PASS=Hospital123!
================================
EOF

echo "Guarda estos valores y pégalos en el chat para configurar front/back/API Gateway."
