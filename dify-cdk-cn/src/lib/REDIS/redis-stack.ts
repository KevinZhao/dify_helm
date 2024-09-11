import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import { Construct } from 'constructs';

interface RedisStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  subnets: ec2.SelectedSubnets;
}

export class RedisStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RedisStackProps) {
    super(scope, id, props);

    // Create a Security Group for ElastiCache Redis
    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for ElastiCache Redis',
      allowAllOutbound: true,
    });

    redisSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(6379),
      'Allow Redis connections from within the VPC',
    );

    // Create a subnet group for the Redis cluster
    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for Redis cluster',
      subnetIds: props.subnets.subnetIds,
    });

    // Create a Redis parameter group
    const redisParameterGroup = new elasticache.CfnParameterGroup(this, 'RedisParameterGroup', {
      cacheParameterGroupFamily: 'redis7',
      description: 'Parameter group for Redis 7.x cluster',
      properties: {
        'maxmemory-policy': 'allkeys-lru',
      },
    });

    // Create the Redis cluster
    const redisCluster = new elasticache.CfnReplicationGroup(this, 'RedisCluster', {
      replicationGroupDescription: 'Redis cluster for Dify',
      engine: 'redis',
      cacheNodeType: 'cache.t3.medium',
      numNodeGroups: 1,
      replicasPerNodeGroup: 1,
      automaticFailoverEnabled: true,
      multiAzEnabled: true,
      cacheSubnetGroupName: redisSubnetGroup.ref,
      securityGroupIds: [redisSecurityGroup.securityGroupId],
      port: 6379,
      engineVersion: '7.0',  // Updated to Redis 7.x
      replicationGroupId: 'dify-redis-cluster',
      cacheParameterGroupName: redisParameterGroup.ref,
    });

    // Output the Redis cluster endpoint
    new cdk.CfnOutput(this, 'RedisClusterEndpoint', {
      value: redisCluster.attrPrimaryEndPointAddress,
      description: 'Redis Cluster Endpoint',
      exportName: 'RedisClusterEndpoint',
    });

    // Output the Redis cluster port
    new cdk.CfnOutput(this, 'RedisClusterPort', {
      value: redisCluster.attrPrimaryEndPointPort,
      description: 'Redis Cluster Port',
      exportName: 'RedisClusterPort',
    });
  }
}
