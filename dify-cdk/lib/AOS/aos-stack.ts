import * as cdk from 'aws-cdk-lib';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { AnyPrincipal } from "aws-cdk-lib/aws-iam";
import { Construct } from 'constructs';

interface OpenSearchStackProps extends cdk.StackProps {
  vpc: cdk.aws_ec2.Vpc;
  privateSubnets: cdk.aws_ec2.SelectedSubnets;
}

export class OpenSearchStack extends cdk.Stack {
  public readonly openSearchDomain: opensearch.Domain;

  constructor(scope: Construct, id: string, props: OpenSearchStackProps) {
    super(scope, id, props);

    const openSearchSecurityGroup = new cdk.aws_ec2.SecurityGroup(this, 'OpenSearchSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Amazon OpenSearch Service',
      allowAllOutbound: true,
    });

    openSearchSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      'Allow database connections from within the VPC'
    );

    this.openSearchDomain = new opensearch.Domain(this, 'Domain', {
      version: opensearch.EngineVersion.OPENSEARCH_2_13,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      domainName: 'dify-aos',
      capacity: {
        multiAzWithStandbyEnabled: false,
        masterNodes: 3,
        masterNodeInstanceType: 'r6g.large.search',
        dataNodes: 2,
        dataNodeInstanceType: 'r6g.large.search',
      },
      ebs: {
        volumeSize: 10,
        volumeType: ec2.EbsDeviceVolumeType.GP3,
      },
      zoneAwareness: {
        enabled: true,
      },
      nodeToNodeEncryption: true,
      enforceHttps: true,
      encryptionAtRest: {
        enabled: true,
      },
      fineGrainedAccessControl: {
        masterUserName: 'admin',
        masterUserPassword: cdk.SecretValue.unsafePlainText('1qaz@WSX'),
      },
      vpc: props.vpc,
      securityGroups: [openSearchSecurityGroup],
      accessPolicies: [
        new iam.PolicyStatement({
          actions: ['es:*ESHttpPost', 'es:ESHttpPut*'],
          effect: iam.Effect.ALLOW,
          principals: [new AnyPrincipal()],
          resources: ['*'],
        }),
      ],
    });
  }
}