import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import { Construct } from 'constructs';

interface RedisServerlessStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  subnets: ec2.SelectedSubnets;
}

export class RedisServerlessStack extends cdk.Stack {
  public readonly dify_cluster: elasticache.CfnServerlessCache; // 公共属性
  public readonly celery_broker_cluster: elasticache.CfnServerlessCache;

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
    this.dify_cluster = new elasticache.CfnServerlessCache(this, 'RedisServerlessCache', {
      engine: 'redis',
      serverlessCacheName: 'dify-redis-cache', // Unique identifier for the cache
      subnetIds: props.subnets.subnetIds,
      securityGroupIds: [redisSecurityGroup.securityGroupId],
      description: 'Dify Redis Serverless Cache',
    });

    this.celery_broker_cluster = new elasticache.CfnServerlessCache(this, 'CeleryBrokerRedisServerlessCache', {
      engine: 'redis',
      serverlessCacheName: 'dify-redis-celery-broker-cache', // Unique identifier for the cache
      subnetIds: props.subnets.subnetIds,
      securityGroupIds: [redisSecurityGroup.securityGroupId],
      description: 'Dify Redis Serverless Cache',
    });

    new cdk.CfnOutput(this, 'RedisPrimaryEndpoint', {
      value: this.dify_cluster.attrEndpointAddress,
      description: 'Primary endpoint for the Redis replication group',
      exportName: 'RedisPrimaryEndpoint',
    });

    new cdk.CfnOutput(this, 'CeleryBrokerRedisPrimaryEndpoint', {
      value: this.celery_broker_cluster.attrEndpointAddress,
      description: 'Primary endpoint for the Redis replication group',
      exportName: 'CeleryBrokerRedisPrimaryEndpoint',
    });

    new cdk.CfnOutput(this, 'RedisPort', {
      value: this.dify_cluster.attrEndpointPort,
      description: 'Redis Port',
      exportName: 'RedisPort',
    });

  }
}