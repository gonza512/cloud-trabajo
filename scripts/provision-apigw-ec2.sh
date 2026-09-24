#!/usr/bin/env bash
# EC2 + API Gateway (JWT Cognito) para rúbrica EP2
# Pegar en terminal del Learner Lab (us-east-1)
set -euo pipefail
REGION=us-east-1
PREFIX=hospital-dsy1107
POOL=us-east-1_7yYrEJl8g
CLIENT=1g7gh607pfmd9qpjtqls234h8o
ISSUER="https://cognito-idp.${REGION}.amazonaws.com/${POOL}"

echo '== identidad =='
aws sts get-caller-identity --region "$REGION"

echo '== AMI Amazon Linux 2023 =='
AMI=$(aws ec2 describe-images --region "$REGION" --owners amazon \
  --filters "Name=name,Values=al2023-ami-2023*-x86_64" "Name=state,Values=available" \
  --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text)
echo AMI=$AMI

echo '== Security Group EC2 (22,8080) =='
VPC=$(aws ec2 describe-vpcs --region "$REGION" --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
SG=$(aws ec2 create-security-group --region "$REGION" --group-name ${PREFIX}-ec2-sg \
  --description 'hospital backend' --vpc-id "$VPC" --query GroupId --output text 2>/dev/null \
  || aws ec2 describe-security-groups --region "$REGION" --filters Name=group-name,Values=${PREFIX}-ec2-sg \
  --query 'SecurityGroups[0].GroupId' --output text)
aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG" --protocol tcp --port 22 --cidr 0.0.0.0/0 2>/dev/null || true
aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG" --protocol tcp --port 8080 --cidr 0.0.0.0/0 2>/dev/null || true
echo SG=$SG

SUBNET=$(aws ec2 describe-subnets --region "$REGION" --filters Name=vpc-id,Values="$VPC" \
  --query 'Subnets[0].SubnetId' --output text)

# User data: Java 21 + placeholder; el JAR se sube después por S3/SCP
USERDATA=$(cat <<'EOF' | base64 -w 0
#!/bin/bash
dnf update -y
dnf install -y java-21-amazon-corretto-headless
mkdir -p /opt/hospital
cat >/etc/systemd/system/hospital.service <<'UNIT'
[Unit]
Description=Hospital Spring Boot
After=network.target
[Service]
WorkingDirectory=/opt/hospital
ExecStart=/usr/bin/java -jar /opt/hospital/app.jar
Restart=always
User=ec2-user
[Install]
WantedBy=multi-user.target
UNIT
EOF
)

echo '== Lanzar EC2 t3.micro =='
IID=$(aws ec2 run-instances --region "$REGION" \
  --image-id "$AMI" \
  --instance-type t3.micro \
  --subnet-id "$SUBNET" \
  --security-group-ids "$SG" \
  --associate-public-ip-address \
  --user-data "$USERDATA" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${PREFIX}-api}]" \
  --query 'Instances[0].InstanceId' --output text)
echo INSTANCE=$IID

echo '== Esperando EC2 running + IP =='
aws ec2 wait instance-running --region "$REGION" --instance-ids "$IID"
PUB=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$IID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
echo PUBLIC_IP=$PUB

echo '== Bucket S3 para el JAR =='
BUCKET="${PREFIX}-jar-${RANDOM}"
aws s3 mb "s3://${BUCKET}" --region "$REGION"
echo BUCKET=$BUCKET
echo 'Sube el JAR desde tu PC (ver instrucciones) y luego:'
echo "  aws s3 cp s3://${BUCKET}/app.jar /tmp && ..."

echo '== API Gateway HTTP + JWT Cognito + CORS =='
API=$(aws apigatewayv2 create-api --region "$REGION" --name ${PREFIX}-http-api \
  --protocol-type HTTP \
  --cors-configuration "AllowOrigins=http://localhost:5173,AllowMethods=GET,POST,PUT,DELETE,OPTIONS,AllowHeaders=Authorization,Content-Type,*,MaxAge=86400,AllowCredentials=false" \
  --query ApiId --output text)
echo API_ID=$API

AUTH=$(aws apigatewayv2 create-authorizer --region "$REGION" --api-id "$API" \
  --name CognitoJWT \
  --authorizer-type JWT \
  --identity-source '$request.header.Authorization' \
  --jwt-configuration "Audience=${CLIENT},Issuer=${ISSUER}" \
  --query AuthorizerId --output text)
echo AUTH_ID=$AUTH

# Integración HTTP proxy al EC2 (cuando el jar esté arriba)
INT=$(aws apigatewayv2 create-integration --region "$REGION" --api-id "$API" \
  --integration-type HTTP_PROXY \
  --integration-method ANY \
  --payload-format-version 1.0 \
  --integration-uri "http://${PUB}:8080/{proxy}" \
  --query IntegrationId --output text)
echo INT_ID=$INT

# Rutas protegidas
for R in 'GET /api/v1/{proxy+}' 'POST /api/v1/{proxy+}' 'PUT /api/v1/{proxy+}' 'DELETE /api/v1/{proxy+}'; do
  METHOD=${R%% *}
  PATH=${R#* }
  RID=$(aws apigatewayv2 create-route --region "$REGION" --api-id "$API" \
    --route-key "$METHOD $PATH" \
    --authorization-type JWT \
    --authorizer-id "$AUTH" \
    --target "integrations/${INT}" \
    --query RouteId --output text)
  echo "ROUTE $METHOD $PATH = $RID"
done

# OPTIONS sin auth (preflight) — CORS ya a nivel API; ruta opcional
aws apigatewayv2 create-route --region "$REGION" --api-id "$API" \
  --route-key 'OPTIONS /api/v1/{proxy+}' \
  --target "integrations/${INT}" >/dev/null 2>&1 || true

STAGE=$(aws apigatewayv2 create-stage --region "$REGION" --api-id "$API" \
  --stage-name prod --auto-deploy \
  --query StageName --output text)

echo
echo '========== PEGA ESTO EN EL CHAT =========='
echo EC2_ID=$IID
echo EC2_IP=$PUB
echo S3_BUCKET=$BUCKET
echo API_ID=$API
echo API_URL=https://${API}.execute-api.${REGION}.amazonaws.com/prod
echo AUTH_ID=$AUTH
echo 'Luego sube el JAR y arranca el servicio en EC2 (instrucciones Cursor).'
echo '=========================================='
