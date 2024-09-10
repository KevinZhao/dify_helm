import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib';

interface RDSStackProps extends cdk.StackProps {
  subnets: cdk.aws_ec2.SelectedSubnets;
  vpc: ec2.Vpc;
}

export class RDSStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RDSStackProps) {
    super(scope, id, props);

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DBSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for RDS database',
      allowAllOutbound: true
    });

    dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'Allow database connections from within the VPC'
    );

    const cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_15_4 }),
      vpc: props.vpc,
      vpcSubnets: props.subnets,
      credentials: rds.Credentials.fromGeneratedSecret('postgres'),
      clusterIdentifier: 'dify-db',
      defaultDatabaseName: 'dify',
      // capacity applies to all serverless instances in the cluster
      serverlessV2MaxCapacity: 8,
      serverlessV2MinCapacity: 0.5,
      securityGroups: [dbSecurityGroup],

      writer: rds.ClusterInstance.serverlessV2('writer'),
      /*readers: [
        // will be put in promotion tier 1 and will scale with the writer
        //rds.ClusterInstance.serverlessV2('reader1', { scaleWithWriter: true }),
        // will be put in promotion tier 2 and will not scale with the writer
        rds.ClusterInstance.serverlessV2('reader'),
      ],*/
    });
  }

  



}