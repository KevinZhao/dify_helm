import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import { Construct } from 'constructs';

interface RedisStackProps extends cdk.StackProps {
  redisClusterName: string;
  prefix: string;
  vpc: ec2.Vpc;
  subnets: ec2.SelectedSubnets;
}

export class RedisStack extends cdk.Stack {
  public readonly redisCluster: elasticache.CfnReplicationGroup;

  constructor(scope: Construct, id: string, props: RedisStackProps) {
    super(scope, id, props);

    // Create a Security Group for ElastiCache Redis
    const redisSecurityGroup = new ec2.SecurityGroup(this, `${props.prefix}-redis-security-group`, {
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
    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, `${props.prefix}-redis-subnet-group`, {
      description: 'Dify Subnet group for Redis cluster',
      subnetIds: props.subnets.subnetIds,
    });

    // Create a Redis parameter group
    const redisParameterGroup = new elasticache.CfnParameterGroup(this, `${props.prefix}-redis-parameter-group`, {
      cacheParameterGroupFamily: 'redis7',
      description: 'Dify Parameter group for Redis 7.x cluster',
      properties: {
        'maxmemory-policy': 'allkeys-lru',
      },
    });

    // Create the Redis cluster with cluster mode enabled
    this.redisCluster = new elasticache.CfnReplicationGroup(this, props.redisClusterName, {
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
      replicationGroupId: props.redisClusterName,
      cacheParameterGroupName: redisParameterGroup.ref,
    });

    // Output the Redis cluster endpoint
    new cdk.CfnOutput(this, 'RedisClusterEndpoint', {
      value: this.redisCluster.attrPrimaryEndPointAddress,
      description: 'Redis Cluster Endpoint',
      exportName: 'RedisClusterEndpoint',
    });

    // Output the Redis cluster port
    new cdk.CfnOutput(this, 'RedisClusterPort', {
      value: this.redisCluster.attrPrimaryEndPointPort,
      description: 'Redis Cluster Port',
      exportName: 'RedisClusterPort',
    });
  }
}
