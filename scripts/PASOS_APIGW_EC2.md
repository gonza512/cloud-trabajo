# Paso a paso EC2 + API Gateway (rúbrica EP2)
# Copia bloque por bloque en la terminal del Learner Lab

## Estado actual (ya creado)
- EC2: `i-0d1ee8881f4ecb9c2`
- API Gateway: `31ayxcki45`
- Authorizer JWT: `bgpmw7`
- Cognito Pool: `us-east-1_7yYrEJl8g` / Client: `1g7gh607pfmd9qpjtqls234h8o`
- RDS: `hospital-dsy1107-mysql.ctbzhktilybp.us-east-1.rds.amazonaws.com`

## BLOQUE FIX — IP real + integración + rutas (pega esto YA)
```bash
REGION=us-east-1
IID=i-0d1ee8881f4ecb9c2
API=31ayxcki45
AUTH=bgpmw7

PUB=$(aws ec2 describe-instances --region $REGION --instance-ids $IID --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
echo PUBLIC_IP=$PUB

INT=$(aws apigatewayv2 create-integration --region $REGION --api-id $API \
  --integration-type HTTP_PROXY --integration-method ANY --payload-format-version 1.0 \
  --integration-uri "http://${PUB}:8080/api/v1/{proxy}" \
  --query IntegrationId --output text)
echo INT=$INT

for M in GET POST PUT DELETE; do
  aws apigatewayv2 create-route --region $REGION --api-id $API \
    --route-key "$M /api/v1/{proxy+}" \
    --authorization-type JWT --authorizer-id $AUTH \
    --target integrations/$INT
done
aws apigatewayv2 create-route --region $REGION --api-id $API \
  --route-key 'OPTIONS /api/v1/{proxy+}' \
  --target integrations/$INT

echo API_URL=https://$API.execute-api.$REGION.amazonaws.com/prod
```

## BLOQUE JAR — bucket S3
```bash
REGION=us-east-1
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET=hospital-dsy1107-jar-$ACCOUNT
aws s3 mb s3://$BUCKET --region $REGION 2>/dev/null || true
echo BUCKET=$BUCKET
echo ">>> Consola S3: sube backend/target/hospital-0.0.1-SNAPSHOT.jar como hospital.jar"
```

## BLOQUE START — EC2 con Java + jar (presign) + re-apuntar Gateway
```bash
REGION=us-east-1
PREFIX=hospital-dsy1107
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET=hospital-dsy1107-jar-$ACCOUNT
PRESIGN=$(aws s3 presign s3://$BUCKET/hospital.jar --expires-in 7200)
AMI=$(aws ec2 describe-images --region $REGION --owners amazon --filters "Name=name,Values=al2023-ami-2023*-x86_64" "Name=state,Values=available" --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text)
VPC=$(aws ec2 describe-vpcs --region $REGION --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
SUBNET=$(aws ec2 describe-subnets --region $REGION --filters Name=vpc-id,Values=$VPC --query 'Subnets[0].SubnetId' --output text)
SG=$(aws ec2 describe-security-groups --region $REGION --filters Name=group-name,Values=${PREFIX}-ec2-sg --query 'SecurityGroups[0].GroupId' --output text)

aws ec2 terminate-instances --region $REGION --instance-ids i-0d1ee8881f4ecb9c2 2>/dev/null || true

cat > /tmp/ud.sh <<EOF
#!/bin/bash
set -eux
dnf install -y java-17-amazon-corretto-headless
mkdir -p /opt/hospital
curl -fsSL '$PRESIGN' -o /opt/hospital/hospital.jar
cd /opt/hospital
nohup java -jar hospital.jar > app.log 2>&1 &
EOF

IID=$(aws ec2 run-instances --region $REGION --image-id $AMI --instance-type t3.micro \
  --subnet-id $SUBNET --security-group-ids $SG --associate-public-ip-address \
  --user-data file:///tmp/ud.sh \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${PREFIX}-api}]" \
  --query 'Instances[0].InstanceId' --output text)
echo INSTANCE=$IID
aws ec2 wait instance-running --region $REGION --instance-ids $IID
sleep 50
PUB=$(aws ec2 describe-instances --region $REGION --instance-ids $IID --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
echo PUBLIC_IP=$PUB

API=31ayxcki45
AUTH=bgpmw7
INT=$(aws apigatewayv2 create-integration --region $REGION --api-id $API \
  --integration-type HTTP_PROXY --integration-method ANY --payload-format-version 1.0 \
  --integration-uri "http://${PUB}:8080/api/v1/{proxy}" \
  --query IntegrationId --output text)
echo INT=$INT

for M in GET POST PUT DELETE; do
  KEY="$M /api/v1/{proxy+}"
  RID=$(aws apigatewayv2 get-routes --region $REGION --api-id $API --query "Items[?RouteKey=='$KEY'].RouteId" --output text)
  if [ -n "$RID" ]; then
    aws apigatewayv2 update-route --region $REGION --api-id $API --route-id $RID --target integrations/$INT
  else
    aws apigatewayv2 create-route --region $REGION --api-id $API --route-key "$KEY" \
      --authorization-type JWT --authorizer-id $AUTH --target integrations/$INT
  fi
done
KEY='OPTIONS /api/v1/{proxy+}'
RID=$(aws apigatewayv2 get-routes --region $REGION --api-id $API --query "Items[?RouteKey=='$KEY'].RouteId" --output text)
if [ -n "$RID" ]; then
  aws apigatewayv2 update-route --region $REGION --api-id $API --route-id $RID --target integrations/$INT
else
  aws apigatewayv2 create-route --region $REGION --api-id $API --route-key "$KEY" --target integrations/$INT
fi

echo API_URL=https://$API.execute-api.$REGION.amazonaws.com/prod
curl -s -o /dev/null -w "health_ec2=%{http_code}\n" http://$PUB:8080/actuator/health || true
curl -s -o /dev/null -w "api_sin_token=%{http_code}\n" https://$API.execute-api.$REGION.amazonaws.com/prod/api/v1/patients || true
```

## Archivo local
`backend/target/hospital-0.0.1-SNAPSHOT.jar` (~64 MB) → S3 `hospital.jar`.
