import * as cdk from 'aws-cdk-lib';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface OpenSearchStackProps extends cdk.StackProps {
  vpc: cdk.aws_ec2.Vpc;
  subnets: cdk.aws_ec2.SelectedSubnets;
  domainName: string;
}

export class OpenSearchStack extends cdk.Stack {
  public readonly openSearchDomain: opensearch.Domain;

  constructor(scope: Construct, id: string, props: OpenSearchStackProps) {
    super(scope, id, props);

    // Retrieve the password from context
    const masterUserPassword = this.node.tryGetContext('opensearchPassword');
    if (!masterUserPassword) {
      throw new Error("Context variable 'opensearchPassword' is missing");
    }

    const openSearchSecurityGroup = new cdk.aws_ec2.SecurityGroup(this, 'OpenSearchSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Amazon OpenSearch Service',
      allowAllOutbound: true,
    });

    openSearchSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      'Allow HTTPS connections from within the VPC'
    );

    // 添加对 9200 端口的入站规则
    openSearchSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(9200),
      'Allow HTTP connections on port 9200 from within the VPC'
    );

    this.openSearchDomain = new opensearch.Domain(this, 'Domain', {
      version: opensearch.EngineVersion.OPENSEARCH_2_13,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      domainName: props.domainName,
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
        masterUserPassword: cdk.SecretValue.unsafePlainText(masterUserPassword),
      },
      vpc: props.vpc,
      securityGroups: [openSearchSecurityGroup],

      accessPolicies: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          principals: [new iam.AnyPrincipal()], 
          actions: ['es:*'],  
          resources: [`arn:aws:es:${this.region}:${this.account}:domain/${props.domainName}/*`],
        }),
      ],
    });

    // Outputs
    new cdk.CfnOutput(this, 'OpenSearchDomainEndpoint', {
      value: this.openSearchDomain.domainEndpoint,
      description: 'OpenSearch Domain Endpoint',
      exportName: 'OpenSearchDomainEndpoint',
    });

  }
}