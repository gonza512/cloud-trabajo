/**
 * Provision Cognito + RDS/Aurora + SG en us-east-1
 * Uso:
 *   set AWS_ACCESS_KEY_ID=...
 *   set AWS_SECRET_ACCESS_KEY=...
 *   set AWS_SESSION_TOKEN=...
 *   node scripts/provision.mjs
 */
import {
  CognitoIdentityProviderClient,
  CreateUserPoolCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolDomainCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import {
  RDSClient,
  CreateDBSubnetGroupCommand,
  CreateDBClusterCommand,
  CreateDBInstanceCommand,
  DescribeDBInstancesCommand,
  DescribeDBClustersCommand,
  waitUntilDBInstanceAvailable,
  waitUntilDBClusterAvailable,
} from '@aws-sdk/client-rds'
import {
  EC2Client,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  DescribeSecurityGroupsCommand,
} from '@aws-sdk/client-ec2'
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'

const REGION = 'us-east-1'
const PREFIX = 'hospital-dsy1107'
const DB_NAME = 'db_hospital_vm'
const DB_USER = 'hospitaladmin'
const DB_PASS = 'HospitalAdmin123!'
const DOMAIN = `hospital-dsy1107-${Date.now().toString().slice(-5)}`

const cognito = new CognitoIdentityProviderClient({ region: REGION })
const rds = new RDSClient({ region: REGION })
const ec2 = new EC2Client({ region: REGION })
const sts = new STSClient({ region: REGION })

async function main() {
  const id = await sts.send(new GetCallerIdentityCommand({}))
  console.log('Identity:', id.Account, id.Arn)

  const vpcs = await ec2.send(new DescribeVpcsCommand({ Filters: [{ Name: 'isDefault', Values: ['true'] }] }))
  const vpcId = vpcs.Vpcs[0].VpcId

  let sgId
  try {
    const sg = await ec2.send(new CreateSecurityGroupCommand({
      GroupName: `${PREFIX}-db-sg`,
      Description: 'Hospital MySQL/Aurora',
      VpcId: vpcId,
    }))
    sgId = sg.GroupId
  } catch {
    const existing = await ec2.send(new DescribeSecurityGroupsCommand({
      Filters: [{ Name: 'group-name', Values: [`${PREFIX}-db-sg`] }],
    }))
    sgId = existing.SecurityGroups[0].GroupId
  }

  try {
    await ec2.send(new AuthorizeSecurityGroupIngressCommand({
      GroupId: sgId,
      IpPermissions: [{ IpProtocol: 'tcp', FromPort: 3306, ToPort: 3306, IpRanges: [{ CidrIp: '0.0.0.0/0' }] }],
    }))
  } catch { /* already open */ }

  const subnets = await ec2.send(new DescribeSubnetsCommand({ Filters: [{ Name: 'vpc-id', Values: [vpcId] }] }))
  const subnetIds = subnets.Subnets.map((s) => s.SubnetId).slice(0, 2)

  try {
    await rds.send(new CreateDBSubnetGroupCommand({
      DBSubnetGroupName: `${PREFIX}-subnets`,
      DBSubnetGroupDescription: 'hospital lab',
      SubnetIds: subnetIds,
    }))
  } catch { /* exists */ }

  let mode = 'aurora'
  let dbHost
  try {
    await rds.send(new CreateDBClusterCommand({
      DBClusterIdentifier: `${PREFIX}-aurora`,
      Engine: 'aurora-mysql',
      EngineVersion: '8.0.mysql_aurora.3.04.0',
      MasterUsername: DB_USER,
      MasterUserPassword: DB_PASS,
      DatabaseName: DB_NAME,
      VpcSecurityGroupIds: [sgId],
      DBSubnetGroupName: `${PREFIX}-subnets`,
      ServerlessV2ScalingConfiguration: { MinCapacity: 0.5, MaxCapacity: 1 },
    }))
    await rds.send(new CreateDBInstanceCommand({
      DBInstanceIdentifier: `${PREFIX}-aurora-i1`,
      DBClusterIdentifier: `${PREFIX}-aurora`,
      DBInstanceClass: 'db.serverless',
      Engine: 'aurora-mysql',
    }))
    console.log('Waiting Aurora...')
    await waitUntilDBClusterAvailable({ client: rds, maxWaitTime: 900 }, { DBClusterIdentifier: `${PREFIX}-aurora` })
    const clusters = await rds.send(new DescribeDBClustersCommand({ DBClusterIdentifier: `${PREFIX}-aurora` }))
    dbHost = clusters.DBClusters[0].Endpoint
  } catch (e) {
    console.warn('Aurora blocked/failed, using RDS MySQL:', e.name || e.message)
    mode = 'mysql'
    await rds.send(new CreateDBInstanceCommand({
      DBInstanceIdentifier: `${PREFIX}-mysql`,
      DBInstanceClass: 'db.t3.micro',
      Engine: 'mysql',
      EngineVersion: '8.0',
      MasterUsername: DB_USER,
      MasterUserPassword: DB_PASS,
      AllocatedStorage: 20,
      DBName: DB_NAME,
      VpcSecurityGroupIds: [sgId],
      DBSubnetGroupName: `${PREFIX}-subnets`,
      PubliclyAccessible: true,
      BackupRetentionPeriod: 0,
      MultiAZ: false,
      StorageType: 'gp2',
    }))
    console.log('Waiting RDS MySQL...')
    await waitUntilDBInstanceAvailable({ client: rds, maxWaitTime: 900 }, { DBInstanceIdentifier: `${PREFIX}-mysql` })
    const inst = await rds.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: `${PREFIX}-mysql` }))
    dbHost = inst.DBInstances[0].Endpoint.Address
  }

  const pool = await cognito.send(new CreateUserPoolCommand({
    PoolName: 'HospitalUserPool-DSY1107',
    AutoVerifiedAttributes: ['email'],
    UsernameAttributes: ['email'],
    MfaConfiguration: 'OFF',
    Policies: {
      PasswordPolicy: {
        MinimumLength: 8,
        RequireUppercase: true,
        RequireLowercase: true,
        RequireNumbers: true,
        RequireSymbols: false,
      },
    },
  }))
  const poolId = pool.UserPool.Id

  const client = await cognito.send(new CreateUserPoolClientCommand({
    UserPoolId: poolId,
    ClientName: 'HospitalFront',
    GenerateSecret: false,
    ExplicitAuthFlows: ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
    SupportedIdentityProviders: ['COGNITO'],
    CallbackURLs: ['http://localhost:5173'],
    LogoutURLs: ['http://localhost:5173'],
    AllowedOAuthFlows: ['code'],
    AllowedOAuthScopes: ['openid', 'email', 'profile', 'phone'],
    AllowedOAuthFlowsUserPoolClient: true,
    PreventUserExistenceErrors: 'ENABLED',
  }))
  const clientId = client.UserPoolClient.ClientId

  await cognito.send(new CreateUserPoolDomainCommand({ Domain: DOMAIN, UserPoolId: poolId }))

  try {
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: poolId,
      Username: 'alumno@duocuc.cl',
      UserAttributes: [
        { Name: 'email', Value: 'alumno@duocuc.cl' },
        { Name: 'email_verified', Value: 'true' },
      ],
      TemporaryPassword: 'TempPass123!',
      MessageAction: 'SUPPRESS',
    }))
    await cognito.send(new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username: 'alumno@duocuc.cl',
      Password: 'Hospital123!',
      Permanent: true,
    }))
  } catch (e) {
    console.warn('User create:', e.name || e.message)
  }

  const out = {
    MODE: mode,
    DB_HOST: dbHost,
    DB_NAME,
    DB_USER,
    DB_PASS,
    JDBC: `jdbc:mysql://${dbHost}:3306/${DB_NAME}?useSSL=true&allowPublicKeyRetrieval=true`,
    COGNITO_POOL_ID: poolId,
    COGNITO_CLIENT_ID: clientId,
    COGNITO_AUTHORITY: `https://cognito-idp.${REGION}.amazonaws.com/${poolId}`,
    COGNITO_DOMAIN: `https://${DOMAIN}.auth.${REGION}.amazoncognito.com`,
    COGNITO_USER: 'alumno@duocuc.cl',
    COGNITO_PASS: 'Hospital123!',
  }

  console.log('\n========== RESULTADOS ==========')
  for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`)
  console.log('================================')

  const fs = await import('node:fs')
  fs.writeFileSync('scripts/aws-outputs.env', Object.entries(out).map(([k, v]) => `${k}=${v}`).join('\n'))
  console.log('Guardado en scripts/aws-outputs.env')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
