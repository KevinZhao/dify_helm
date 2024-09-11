import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

interface RDSStackProps extends cdk.StackProps {
  subnets: cdk.aws_ec2.SelectedSubnets;
  vpc: ec2.Vpc;
}

export class RDSStack extends cdk.Stack {
  public readonly secretArn: string;
  public readonly cluster: rds.DatabaseCluster;

  constructor(scope: Construct, id: string, props: RDSStackProps) {
    super(scope, id, props);

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DBSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for RDS database',
      allowAllOutbound: true,
    });

    dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'Allow database connections from within the VPC'
    );

    this.cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_4,
      }),
      vpc: props.vpc,
      vpcSubnets: props.subnets,
      credentials: rds.Credentials.fromGeneratedSecret('postgres'), // 自动生成密码
      clusterIdentifier: 'dify-db',
      defaultDatabaseName: 'dify',
      serverlessV2MaxCapacity: 8,
      serverlessV2MinCapacity: 0.5,
      securityGroups: [dbSecurityGroup],
      writer: rds.ClusterInstance.serverlessV2('writer'),
    });

    // 输出 Secrets Manager 中的 Secret ARN
    this.secretArn = this.cluster.secret?.secretArn ?? '';

    new cdk.CfnOutput(this, 'RDSSecretArn', {
      value: this.secretArn,
      description: 'The ARN of the RDS Secret',
    });
    
  }
}