#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DifyHelmStack } from '../lib/dify-helm-stack';
import { S3Stack } from '../lib/S3/s3-stack';
import { VPCStack } from '../lib/VPC/vpc-stack';
import { RDSStack } from '../lib/RDS/rds-stack';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { RedisServerlessStack } from '../lib/redis/redis-stack';
import { OpenSearchStack } from '../lib/AOS/aos-stack';
import { EKSStack } from '../lib/EKS/eks-stack';

const app = new cdk.App();

/*----------------------------------------------------------------------------------------------*/
// 0. deploy VPC 
const vpcStack = new VPCStack(app, 'DifyVPCStack');
const privateSubnets = vpcStack.vpc.selectSubnets({subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS});

// 1. deploy the rest that depends on VPC
// This can be by concurrent deploy by execution:
// cdk deploy --all --concurrency 5 --require-approval never
/*----------------------------------------------------------------------------------------------*/
const s3Stack = new S3Stack(app, 'DifyS3Stack');

const rdsStack = new RDSStack(app, 'DifyRDSStack', { 
    vpc: vpcStack.vpc,
    subnets: privateSubnets 
}); 

const redisServerlessStack = new RedisServerlessStack(app, 'DifyRedisStack', {
    vpc: vpcStack.vpc,
    subnets: privateSubnets
});
    
const openSearchStack = new OpenSearchStack(app, 'DifyOpenSearchStack', {
    vpc: vpcStack.vpc,
    subnets: privateSubnets,
    domainName: 'dify-aos'
});

const eksStack = new EKSStack(app, 'DifyEKSStack', {
    vpc: vpcStack.vpc,
    subnets: privateSubnets });
/*----------------------------------------------------------------------------------------------*/

// 2. deploy dify helm
const difyHelmStack = new DifyHelmStack(app, 'DifyStack', {
    cluster: eksStack.cluster
});

// 设置 difyHelmStack 依赖于 eksStack
difyHelmStack.addDependency(eksStack);