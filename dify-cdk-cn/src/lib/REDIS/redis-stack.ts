import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import { Construct } from 'constructs';

interface RedisStackProps extends cdk.StackProps {
  redisClusterName: string;
  prefix: string;
  vpc: ec2.Vpc;
  subnets: ec2.SubnetSelection;
}

export class RedisStack extends cdk.Stack {
  public readonly redisCluster: elasticache.CfnReplicationGroup;

  constructor(scope: Construct, id: string, props: RedisStackProps) {
    super(scope, id, props);

    // Create a Security Group for ElastiCache Redis
    const redisSecurityGroup = new ec2.SecurityGroup(this, `RedisSecurityGroup`, {
      vpc: props.vpc,
      description: 'Security group for ElastiCache Redis',
      allowAllOutbound: true,
      securityGroupName: `${props.prefix}-redis-security-group`,
    });

    redisSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(6379),
      'Allow Redis connections from within the VPC',
    );

    // Create a subnet group for the Redis cluster
    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Dify Subnet group for Redis cluster',
      subnetIds: props.vpc.selectSubnets(props.subnets).subnetIds,
      cacheSubnetGroupName: `${props.prefix}-redis-subnet-group`,
    });

    // Create the Redis cluster with cluster mode enabled
    this.redisCluster = new elasticache.CfnReplicationGroup(this, props.redisClusterName, {
      replicationGroupDescription: 'Redis cluster for Dify',
      replicationGroupId: props.redisClusterName,
      engine: 'redis',
      cacheNodeType: 'cache.m7g.large',
      cacheSubnetGroupName: redisSubnetGroup.cacheSubnetGroupName,
      securityGroupIds: [redisSecurityGroup.securityGroupId],
      automaticFailoverEnabled: true,
      transitEncryptionEnabled: true,  // Enable transit encryption
      transitEncryptionMode: 'preferred', // Allow both encrypted and unencrypted connections
      atRestEncryptionEnabled: true,
      numCacheClusters: 2, // A primary and a replica node
      multiAzEnabled: true,
      preferredCacheClusterAZs: props.vpc.selectSubnets(props.subnets).availabilityZones,
      port: 6379,
      engineVersion: '7.0',  // Updated to Redis 7.x
    });

    this.redisCluster.addDependency(redisSubnetGroup);

    // Output the Redis cluster endpoint
    new cdk.CfnOutput(this, 'RedisPrimaryEndpoint', {
      value: this.redisCluster.attrPrimaryEndPointAddress,
      description: 'Primary endpoint for the Redis replication group',
      exportName: 'RedisPrimaryEndpoint',
    });

    new cdk.CfnOutput(this, 'RedisPort', {
      value: this.redisCluster.attrPrimaryEndPointPort,
      description: 'Redis Port',
      exportName: 'RedisPort',
    });
  }
}
