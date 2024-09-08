import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import { Construct } from 'constructs';

interface RedisServerlessStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  subnets: ec2.SelectedSubnets;
}

export class RedisServerlessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RedisServerlessStackProps) {
    super(scope, id, props);

    // Create a Security Group for ElastiCache Redis
    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for ElastiCache Redis',
      allowAllOutbound: true,
    });

    // Allow access to Redis within the VPC
    redisSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(6379),
      'Allow Redis connections from within the VPC',
    );

    // Define the Serverless Cache properties
    const redisServerlessCache = new elasticache.CfnServerlessCache(this, 'RedisServerlessCache', {
      engine: 'redis',
      serverlessCacheName: 'dify-redis-serverless-cache', // Unique identifier for the cache
      subnetIds: props.subnets.subnetIds,
      securityGroupIds: [redisSecurityGroup.securityGroupId],
      description: 'Dify Redis Serverless Cache',
      // Optional settings
      /*cacheUsageLimits: {
        dataStorage: {
          unit: 'GB', // Specify the unit of storage
          maximum: 5000, // Maximum storage
          minimum: 1
        },
        ecpuPerSecond: {
          maximum: 15000000, // Max eCPU units
          minimum: 1000, // Min eCPU units
        },
      },*/
      //snapshotRetentionLimit: 7, // Number of snapshots to retain
      //dailySnapshotTime: '02:00', // Optional: time for daily snapshot
      //kmsKeyId: 'your-kms-key-id', // Optional: KMS encryption key for data at rest
    });

    //redisServerlessCache.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
  }
}