#!/usr/bin/env bash
# Recovery: lab deniega Aurora instance -> RDS MySQL + Cognito
set -euo pipefail
REGION=us-east-1
PREFIX=hospital-dsy1107
DB_NAME=db_hospital_vm
DB_USER=hospitaladmin
DB_PASS='HospitalAdmin123!'
DOM="hospital-dsy1107-$(date +%s | tail -c 5)"

echo '== identidad =='
aws sts get-caller-identity --region "$REGION"

echo '== limpiar Aurora incompleto (si existe) =='
aws rds delete-db-cluster \
  --region "$REGION" \
  --db-cluster-identifier "${PREFIX}-aurora" \
  --skip-final-snapshot 2>/dev/null || true

SG=$(aws ec2 describe-security-groups --region "$REGION" \
  --filters Name=group-name,Values="${PREFIX}-db-sg" \
  --query 'SecurityGroups[0].GroupId' --output text)

echo "SG=$SG"

echo '== RDS MySQL db.t3.micro =='
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
  --vpc-security-group-ids "$SG" \
  --db-subnet-group-name "${PREFIX}-subnets" \
  --publicly-accessible \
  --backup-retention-period 0 \
  --no-multi-az \
  --storage-type gp2 \
  --output text >/dev/null

echo '== Cognito =='
POOL=$(aws cognito-idp create-user-pool \
  --region "$REGION" \
  --pool-name HospitalUserPool-DSY1107 \
  --auto-verified-attributes email \
  --username-attributes email \
  --mfa-configuration OFF \
  --policies 'PasswordPolicy={MinimumLength=8,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=false}' \
  --query 'UserPool.Id' --output text)

CLIENT=$(aws cognito-idp create-user-pool-client \
  --region "$REGION" \
  --user-pool-id "$POOL" \
  --client-name HospitalFront \
  --no-generate-secret \
  --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --supported-identity-providers COGNITO \
  --callback-urls http://localhost:5173 \
  --logout-urls http://localhost:5173 \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile phone \
  --allowed-o-auth-flows-user-pool-client \
  --prevent-user-existence-errors ENABLED \
  --query 'UserPoolClient.ClientId' --output text)

aws cognito-idp create-user-pool-domain \
  --region "$REGION" \
  --domain "$DOM" \
  --user-pool-id "$POOL"

aws cognito-idp admin-create-user \
  --region "$REGION" \
  --user-pool-id "$POOL" \
  --username alumno@duocuc.cl \
  --user-attributes Name=email,Value=alumno@duocuc.cl Name=email_verified,Value=true \
  --temporary-password 'TempPass123!' \
  --message-action SUPPRESS 2>/dev/null || true

aws cognito-idp admin-set-user-password \
  --region "$REGION" \
  --user-pool-id "$POOL" \
  --username alumno@duocuc.cl \
  --password 'Hospital123!' \
  --permanent 2>/dev/null || true

echo '== Esperando RDS MySQL (5-10 min) =='
aws rds wait db-instance-available --region "$REGION" --db-instance-identifier "${PREFIX}-mysql"
HOST=$(aws rds describe-db-instances --region "$REGION" \
  --db-instance-identifier "${PREFIX}-mysql" \
  --query 'DBInstances[0].Endpoint.Address' --output text)

echo
echo '========== PEGA ESTO EN EL CHAT =========='
echo MODE=mysql
echo DB_HOST=$HOST
echo DB_NAME=$DB_NAME
echo DB_USER=$DB_USER
echo DB_PASS=$DB_PASS
echo JDBC=jdbc:mysql://${HOST}:3306/${DB_NAME}?useSSL=true\&allowPublicKeyRetrieval=true
echo COGNITO_POOL_ID=$POOL
echo COGNITO_CLIENT_ID=$CLIENT
echo COGNITO_AUTHORITY=https://cognito-idp.${REGION}.amazonaws.com/${POOL}
echo COGNITO_DOMAIN=https://${DOM}.auth.${REGION}.amazoncognito.com
echo COGNITO_USER=alumno@duocuc.cl
echo COGNITO_PASS=Hospital123!
echo '=========================================='
