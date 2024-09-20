import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

// Local definition
import { DifyHelmStack } from '../lib/dify-helm-stack';
import { VPCStack } from '../lib/VPC/vpc-stack';
import { S3Stack } from '../lib/S3/s3-stack';
import { RDSStack } from '../lib/RDS/rds-stack';
import { RedisStack } from '../lib/Redis/redis-stack';
import { EKSStack } from '../lib/EKS/eks-stack';
import { OpenSearchStack } from '../lib/AOS/aos-stack';

const app = new cdk.App();

const vpcName: string = 'dify-vpc';
const s3Prefix: string = 'dify';
const rdsUserName: string = 'postgres';
const rdsDbName: string = 'dify';
const redisClusterName: string = 'dify-redis-cluster';
const redisPrefix: string = 'dify';
const openSearchDomainName: string = 'dify-opensearch';
const eksClusterName: string = 'dify-eks';

// Phase 1
// 0. VPC Stack
const vpcStack = new VPCStack(app, 'VPCStack', {
    vpcName: vpcName,
});
const privateSubnets = vpcStack.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS });

// 1. S3 Stack
const s3Stack = new S3Stack(app, 'S3Stack', {
    prefix: s3Prefix
});

// 2. RDS Postgre SQL Stack
const rdsStack = new RDSStack(app, 'RDSStack', {
    userName: rdsUserName,
    dbName: rdsDbName,
    subnets: privateSubnets,
    vpc: vpcStack.vpc
});
rdsStack.addDependency(vpcStack);

// 3. Redis Stack
const redisStack = new RedisStack(app, 'RedisStack', {
    redisClusterName: redisClusterName,
    prefix: redisPrefix,
    subnets: privateSubnets,
    vpc: vpcStack.vpc
});
redisStack.addDependency(vpcStack);

// 4. Amazon OpenSearch Service Stack
const opensearchStack = new OpenSearchStack(app, 'OpenSearchStack', {
    privateSubnets: privateSubnets.subnets,
    vpc: vpcStack.vpc,
    domainName: openSearchDomainName,
});
opensearchStack.addDependency(vpcStack)

// 5. EKS Stack
const eksStack = new EKSStack(app, 'EKSStack', {
    eksClusterName: eksClusterName,

    // VPC props
    subnets: privateSubnets,
    vpc: vpcStack.vpc,
});
eksStack.addDependency(vpcStack)

const dbEndpoint = cdk.Fn.importValue('RDSInstanceEndpoint');
const dbPort = cdk.Fn.importValue('RDSInstancePort');
const redisEndpoint = cdk.Fn.importValue('RedisPrimaryEndpoint');
const redisPort = cdk.Fn.importValue('RedisPort');
const openSearchEndpoint = cdk.Fn.importValue('OpenSearchDomainEndpoint');
const s3BucketName = cdk.Fn.importValue('S3BucketName');


// Phase 2
// Deploy Dify Helm Chart
const difyHelmStack = new DifyHelmStack(app, 'DifyStack', {
    cluster: eksStack.cluster,

    // RDS
    dbEndpoint: dbEndpoint,
    dbPort: dbPort,
    dbName: rdsDbName,

    // S3
    s3BucketName: s3BucketName,

    // Redis
    redisEndpoint: redisEndpoint,
    redisPort: redisPort,

    // OpenSearch
    openSearchEndpoint: openSearchEndpoint,

});
difyHelmStack.addDependency(eksStack);
difyHelmStack.addDependency(rdsStack);
difyHelmStack.addDependency(redisStack);
difyHelmStack.addDependency(s3Stack);
difyHelmStack.addDependency(opensearchStack);
