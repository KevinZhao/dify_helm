import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib';

interface RDSStackProps extends cdk.StackProps {
  userName: string;
  dbName: string;
  subnets: cdk.aws_ec2.SelectedSubnets;
  vpc: ec2.Vpc;
}

export class RDSStack extends cdk.Stack {
  public readonly cluster: rds.DatabaseCluster;
 
  constructor(scope: Construct, id: string, props: RDSStackProps) {
    super(scope, id, props);

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DBSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for RDS database',
      allowAllOutbound: true
    });

    const instanceType = ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM);

    this.cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_15_4 }),
      writer: rds.ClusterInstance.provisioned('Writer', {
        instanceType: instanceType,
      }),
      readers: [
        rds.ClusterInstance.provisioned('Reader', {
          instanceType: instanceType,
        }),
      ],
      vpc: props.vpc,
      vpcSubnets: props.subnets,
      credentials: rds.Credentials.fromGeneratedSecret(props.userName),
      clusterIdentifier: props.dbName + '-db',
      defaultDatabaseName: props.dbName,
      securityGroups: [dbSecurityGroup],
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT, // Optional: add snapshot after removal
      backup: {
        retention: Duration.days(7),
      },
    });

    dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(this.cluster.clusterEndpoint.port),
      'Allow database connections from within the VPC'
    );

    new cdk.CfnOutput(this, 'RDSSecretArn', {
      value: this.cluster.secret!.secretArn,
      exportName: 'RDSSecretArn',
    });

    new cdk.CfnOutput(this, 'RDSClusterEndpointHostname', {
      value: this.cluster.clusterEndpoint.hostname,
      exportName: 'RDSClusterEndpointHostname'
    });

    new cdk.CfnOutput(this, 'RDSClusterEndpointPort', {
      value: this.cluster.clusterEndpoint.port.toString(),
      exportName: 'RDSClusterEndpointPort'
    });
  }
}
