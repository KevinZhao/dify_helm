import { StackProps, CfnParameter, CfnOutput } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

import { Construct } from 'constructs';

// Local definition
import { VPCStack } from './VPC/vpc-stack';
import { S3Stack } from './S3/s3-stack';
import { RDSStack } from './RDS/rds-stack';
import { RedisStack } from './REDIS/redis-stack';
import { EKSClusterStack } from './EKS/eks-stack';
import { OpenSearchStack } from './AOS/aos-stack';

/*
interface MainStackProps extends StackProps {
  deployRds?: boolean;
}*/

//const app = new cdk.App();

export class DifyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Deployment of Managed Services
    // 0. VPC Stack
    const _VpcStack = new VPCStack(this, 'vpc-Stack', {
      /*env: props.env,*/
    });

    // 1. S3 Stack
    const _S3Stack = new S3Stack(this, 's3-Stack', {
      /*env: props.env,*/
    });

    // 2. RDS Postgre SQL Stack
    const privateSubnets = _VpcStack.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS });
    const _RdsStack = new RDSStack(this, 'rds-Stack', {
      //env: props.env,
      subnets: privateSubnets,
      vpc: _VpcStack.vpc
    });
    _RdsStack.addDependency(_VpcStack);

    // 3. Redis Stack
    const _RedisStack = new RedisStack(this, 'redis-Stack', {
      //env: props.env,
      subnets: privateSubnets,
      vpc: _VpcStack.vpc
    });
    _RedisStack.addDependency(_VpcStack);

    // 4. Amazon OpenSearch Service Stack
    const _AOSStack = new OpenSearchStack(this, 'OpenSearchStack', {
      //env: props.env,
      privateSubnets: privateSubnets.subnets,
      vpc: _VpcStack.vpc,
      domainName: 'dify-opensearch'
    });
    _AOSStack.addDependency(_VpcStack)

    // 5. EKS Stack
    const _eksStack = new EKSClusterStack(this, 'EKSStack', {
      //env: props.env,
      subnets: privateSubnets.subnets,
      vpc: _VpcStack.vpc,
      rdsSecretArn: _RdsStack.secretArn
    });
    _eksStack.addDependency(_RdsStack)
  }
}
