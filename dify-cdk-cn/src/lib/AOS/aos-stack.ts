import * as cdk from 'aws-cdk-lib';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as cr from 'aws-cdk-lib/custom-resources';

export interface OpenSearchStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  privateSubnets: ec2.ISubnet[];
  domainName: string;
}

export class OpenSearchStack extends cdk.Stack {
  public readonly openSearchDomain: opensearch.Domain;

  constructor(scope: Construct, id: string, props: OpenSearchStackProps) {
    super(scope, id, props);

    // Check if the service-linked role exists
    const checkServiceLinkedRole = new cr.AwsCustomResource(this, 'CheckServiceLinkedRole', {
      onCreate: {
        service: 'IAM',
        action: 'getRole',
        parameters: {
          RoleName: 'AWSServiceRoleForAmazonOpenSearchService',
        },
        physicalResourceId: cr.PhysicalResourceId.of('OpenSearchServiceLinkedRole'),
        ignoreErrorCodesMatching: '404',
      },
      onUpdate: {
        service: 'IAM',
        action: 'getRole',
        parameters: {
          RoleName: 'AWSServiceRoleForAmazonOpenSearchService',
        },
        physicalResourceId: cr.PhysicalResourceId.of('OpenSearchServiceLinkedRole'),
        ignoreErrorCodesMatching: '404',
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['iam:GetRole'],
          resources: ['*'],
        }),
      ]),
    });

    // Create a new secret for the OpenSearch master user
    const openSearchMasterUserSecret = new secretsmanager.Secret(this, 'OpenSearchMasterUserSecret', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        includeSpace: false,
      },
    });

    // Create an IAM role for OpenSearch master user
    const openSearchMasterUserRole = new iam.Role(this, 'OpenSearchMasterUserRole', {
      assumedBy: new iam.ServicePrincipal('opensearchservice.amazonaws.com'),
      description: 'IAM role for OpenSearch master user',
    });

    // Grant the role permission to read the secret
    openSearchMasterUserSecret.grantRead(openSearchMasterUserRole);

    const openSearchSecurityGroup = new ec2.SecurityGroup(this, 'OpenSearchSecurityGroup', {
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
      domainName: props.domainName,
      capacity: {
        masterNodes: 3,
        masterNodeInstanceType: 'r6g.large.search',
        dataNodes: 2,
        dataNodeInstanceType: 'r6g.large.search',
        multiAzWithStandbyEnabled: false,
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
        masterUserArn: openSearchMasterUserRole.roleArn,
      },
      vpc: props.vpc,
      vpcSubnets: [{ subnets: props.privateSubnets }],
      securityGroups: [openSearchSecurityGroup],
      accessPolicies: [
        new iam.PolicyStatement({
          actions: ['es:*'],
          effect: iam.Effect.ALLOW,
          principals: [new iam.AnyPrincipal()],
          resources: [this.formatArn({
            service: 'es',
            resource: 'domain',
            resourceName: `${props.domainName}/*`,
          })],
        }),
      ],
    });

    // Ensure the OpenSearch domain is created after checking for the service-linked role
    this.openSearchDomain.node.addDependency(checkServiceLinkedRole);

    // Output the role ARN for reference
    new cdk.CfnOutput(this, 'OpenSearchMasterUserRoleArn', {
      value: openSearchMasterUserRole.roleArn,
      description: 'ARN of the IAM role for OpenSearch master user',
      exportName: 'OpenSearchMasterUserRoleArn',
    });

    new cdk.CfnOutput(this, 'OpenSearchDomainEndpoint', {
      value: this.openSearchDomain.domainEndpoint,
      description: 'OpenSearch Domain Endpoint',
      exportName: 'OpenSearchDomainEndpoint',
    });
  }
}
