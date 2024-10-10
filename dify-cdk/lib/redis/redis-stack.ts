import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

interface RedisClusterStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  subnets: ec2.SubnetSelection;
}

export class RedisClusterStack extends cdk.Stack {
  public readonly redisReplicationGroup: elasticache.CfnReplicationGroup;

  constructor(scope: Construct, id: string, props: RedisClusterStackProps) {
    super(scope, id, props);

    // 创建安全组
    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for ElastiCache Redis',
      allowAllOutbound: true,
    });

    // 允许 VPC 内的 Redis 访问
    redisSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(6379),
      'Allow Redis connections from within the VPC',
    );

    // 选择实际的子网
    const selectedSubnets = props.vpc.selectSubnets(props.subnets);

    // 创建子网组
    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for Redis clusters',
      subnetIds: selectedSubnets.subnetIds, // 使用 selectedSubnets.subnetIds
      cacheSubnetGroupName: 'redis-subnet-group',
    });

    // 获取当前的 AWS 区域
    const currentRegion = cdk.Stack.of(this).region;

    // 根据区域选择 Redis 机型
    const cacheNodeType = this.getCacheNodeTypeForRegion(currentRegion);

    // 创建 Redis 复制组（集群模式禁用）
    this.redisReplicationGroup = new elasticache.CfnReplicationGroup(this, 'RedisReplicationGroup', {
      replicationGroupDescription: 'Dify Redis Replication Group',
      replicationGroupId: 'dify-redis',
      engine: 'redis',
      cacheNodeType: cacheNodeType,
      cacheSubnetGroupName: redisSubnetGroup.cacheSubnetGroupName,
      securityGroupIds: [redisSecurityGroup.securityGroupId],
      automaticFailoverEnabled: true,
      transitEncryptionEnabled: true,  // Enable transit encryption
      transitEncryptionMode: 'preferred', // Allow both encrypted and unencrypted connections
      atRestEncryptionEnabled: true,
      numCacheClusters: 2, // A primary and a replica node
      multiAzEnabled: true,
      preferredCacheClusterAZs: selectedSubnets.availabilityZones,
    });

    // 添加依赖
    this.redisReplicationGroup.addDependency(redisSubnetGroup);

    // 输出
    new cdk.CfnOutput(this, 'RedisPrimaryEndpoint', {
      value: this.redisReplicationGroup.attrPrimaryEndPointAddress,
      description: 'Primary endpoint for the Redis replication group',
      exportName: 'RedisPrimaryEndpoint',
    });

    new cdk.CfnOutput(this, 'RedisPort', {
      value: this.redisReplicationGroup.attrPrimaryEndPointPort,
      description: 'Redis Port',
      exportName: 'RedisPort',
    });
  }

  // 根据 region 返回不同的实例类型
  private getCacheNodeTypeForRegion(region: string): string {
    const regionSpecificNodeTypes: { [key: string]: string } = {
      'us-east-1': 'cache.m7g.large',
      'us-east-2': 'cache.m7g.large',
      'us-west-1': 'cache.m7g.large',
      'us-west-2': 'cache.m7g.large',
      'ap-southeast-1': 'cache.m7g.large',
      'ap-northeast-1': 'cache.m7g.large',
      'eu-central-1': 'cache.m7g.large',
      'eu-west-1': 'cache.m7g.large',
      'eu-west-2': 'cache.m7g.large',
      'eu-west-3': 'cache.m7g.large',
      'eu-north-1': 'cache.m7g.large',
      'ap-southeast-2': 'cache.m7g.large',
      'ap-northeast-2': 'cache.m7g.large',
    };

    // 默认机型
    const defaultNodeType = 'cache.m6g.large';

    return regionSpecificNodeTypes[region] || defaultNodeType;
  }
}