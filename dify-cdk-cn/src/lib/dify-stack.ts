import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

import { Construct } from 'constructs';
import { StackProps, CfnParameter, CfnOutput } from 'aws-cdk-lib';

// Local definition
import { VPCStack } from './VPC/vpc-stack';
import { S3Stack } from './S3/s3-stack';
import { RDSStack } from './RDS/rds-stack';
import { RedisStack } from './Redis/redis-stack';
import { EKSClusterStack } from './EKS/eks-stack';
import { OpenSearchStack } from './AOS/aos-stack';

export class DifyStack extends cdk.Stack {
  private readonly _region: string = 'cn-northwest-1';
  private readonly _vpcName: string = 'dify-vpc';
  private readonly _s3Prefix: string = 'dify';
  private readonly _rdsUserName: string = 'postgres';
  private readonly _rdsDbName: string = 'dify';
  private readonly _redisClusterName: string = 'dify-redis';
  private readonly _redisPrefix: string = 'dify';
  private readonly _openSearchDomainName: string = 'dify-opensearch';

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Deployment of Managed Services
    // 0. VPC Stack
    const _VpcStack = new VPCStack(this, 'VPCStack', {
      vpcName: this._vpcName,
    });
    const privateSubnets = _VpcStack.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS });

    // 1. S3 Stack
    const _S3Stack = new S3Stack(this, 'S3Stack', {
      prefix: this._s3Prefix
    });

    // 2. RDS Postgre SQL Stack
    const _RdsStack = new RDSStack(this, 'RDSStack', {
      userName: this._rdsUserName,
      dbName: this._rdsDbName,
      subnets: privateSubnets,
      vpc: _VpcStack.vpc
    });
    _RdsStack.addDependency(_VpcStack);

    // 3. Redis Stack
    const _RedisStack = new RedisStack(this, 'RedisStack', {
      redisClusterName: this._redisClusterName,
      prefix: this._redisPrefix,
      subnets: privateSubnets,
      vpc: _VpcStack.vpc
    });
    _RedisStack.addDependency(_VpcStack);

    // // 4. Amazon OpenSearch Service Stack
    // const _AOSStack = new OpenSearchStack(this, 'OpenSearchStack', {
    //   privateSubnets: privateSubnets.subnets,
    //   vpc: _VpcStack.vpc,
    //   domainName: this._openSearchDomainName,
    // });
    // _AOSStack.addDependency(_VpcStack)

    // // 5. EKS Stack
    // const _eksStack = new EKSClusterStack(this, 'EKSStack', {
    //   // VPC props
    //   subnets: privateSubnets.subnets,
    //   vpc: _VpcStack.vpc,

    //   // S3 props
    //   s3BucketName: _S3Stack.bucket.bucketName,
    //   s3Endpoint: _S3Stack.bucket.bucketWebsiteDomainName,
    //   s3AccessKey: '',
    //   s3SecretKey: '',

    //   // RDS props
    //   rdsSecretArn: _RdsStack.cluster.secret!.secretArn,
    //   rdsClusterEndpointHostname: _RdsStack.cluster.clusterEndpoint.hostname,
    //   rdsClusterEndpointPort: _RdsStack.cluster.clusterEndpoint.port.toString(),
    //   rdsUserName: this._rdsUserName,
    //   rdsDbName: this._rdsDbName,
    // });
    // _eksStack.addDependency(_RdsStack)
  }
}
