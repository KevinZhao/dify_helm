import {StackProps, CfnParameter, CfnOutput} from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

import { Construct } from 'constructs';

// Local definition
import {VPCStack} from './VPC/vpc-stack';
import {S3Stack} from './S3/s3-stack';
import {RDSStack} from './RDS/rds-stack';
import {RedisServerlessStack} from './redis/redis-stack';
import {EKSClusterStack} from './EKS/eks-stack';
import * as eks from 'aws-cdk-lib/aws-eks';
import {ALBCDeploymentStack} from './EKS/aws-load-balancer-controller';

/*
interface MainStackProps extends StackProps {
  deployRds?: boolean;
}*/

//const app = new cdk.App();

export class MyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 0. VPC Stack
    const _VpcStack = new VPCStack(this, 'vpc-Stack', {
      /*env: props.env,*/
    });

    // 1. S3 Stack
    const _S3Stack = new S3Stack(this, 's3-Stack', {
      /*env: props.env,*/
    });

    // 2. RDS PG Stack
    const privateSubnets = _VpcStack.vpc.selectSubnets({subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS});
    const _RdsStack = new RDSStack(this, 'rds-Stack', {
        //env: props.env,
        subnets: privateSubnets,
        vpc: _VpcStack.vpc
    });

    // 3. Redis Stack
    const redisSubnets = _VpcStack.vpc.selectSubnets({subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS});
    const _Redis = new RedisServerlessStack(this, 'redis-Stack', {
        //env: props.env,
        subnets: privateSubnets,
        vpc: _VpcStack.vpc
    });

    // 4. EKS Stack
    const eksSubnets = _VpcStack.vpc.selectSubnets({subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS});
    const _eksCluster = new EKSClusterStack(this, 'eks-Stack', {
      //env: props.env,
      subnets: privateSubnets,
      vpc: _VpcStack.vpc
    });

    // only one time job
    // Deploy ALBC if it doesn't exist
    new ALBCDeploymentStack(this, 'ALBCDeploymentStack', {
        cluster: _eksCluster.cluster,})
      
    new eks.HelmChart(this, 'DifyHelmChart', {
      cluster: _eksCluster.cluster,
      chart: 'dify',
      repository: 'https://douban.github.io/charts/',
      release: 'dify',
      namespace: 'default',  // 指定命名空间
      values: {
        global: {
          host: 'www.example.com',
          port: '',
          //enableTLS: true,
          image: {
            tag: '0.7.0',
          },
          edition: 'SELF_HOSTED',
          storageType: 's3',
          extraEnvs: [],
          extraBackendEnvs: [
            { name: 'SECRET_KEY', value: 'd/BV81Qc0hY4BSYzoVPdG9evGco1YBYIxyGBWOrLRFe4nwbKTYGnHQdI'},
            { name: 'DB_USERNAME', value: 'postgres' },
            { name: 'DB_PASSWORD', value: 'qgLlS08MzLm.LpzgM4zb5^yxMVR7^g' },
            { name: 'DB_HOST', value: 'dify-db.cluster-cequprvkogfy.us-west-2.rds.amazonaws.com' },
            { name: 'DB_PORT', value: '5432' },
            /*{ name: 'DB_DATABASE', value: 'dify' },
            { name: 'REDIS_HOST', value: 'your_redis_host' },
            { name: 'REDIS_PORT', value: '6379' },
            { name: 'REDIS_DB', value: '1' },*/
            { name: 'S3_BUCKET_NAME', value: _S3Stack.bucket.bucketName },
            { name: 'S3_ENDPOINT', value: _S3Stack.bucket.bucketArn },
          ]
        },
        ingress: {
          enabled: true,
          className: 'alb',
          annotations: {
            'kubernetes.io/ingress.class': 'alb',
            'alb.ingress.kubernetes.io/scheme': 'internet-facing',
            'alb.ingress.kubernetes.io/target-type': 'ip',
            'alb.ingress.kubernetes.io/listen-ports': '[{"HTTPS": 443}, {"HTTP": 80}]',
            //'alb.ingress.kubernetes.io/certificate-arn': 'arn_of_your_certification',
          },
          hosts: [{
            host: 'www.example.com',
            paths: [
              { path: '/api', pathType: 'Prefix', backend: { serviceName: 'dify-api-svc', servicePort: 80 } },
              { path: '/v1', pathType: 'Prefix', backend: { serviceName: 'dify-api-svc', servicePort: 80 } },
              { path: '/console/api', pathType: 'Prefix', backend: { serviceName: 'dify-api-svc', servicePort: 80 } },
              { path: '/files', pathType: 'Prefix', backend: { serviceName: 'dify-api-svc', servicePort: 80 } },
              { path: '/', pathType: 'Prefix', backend: { serviceName: 'dify-frontend', servicePort: 80 } },
            ]
          }]
        },
        frontend: {
          replicaCount: 1,
        },
        api: {
          replicaCount: 1,
        },
        worker: {
          replicaCount: 1,
        },
        postgresql: {
          embedded: false
        },
        redis: {
          embedded: true
        }
      }
    });
  
  }
}