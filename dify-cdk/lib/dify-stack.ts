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

export class DifyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Deployment of Managed Services
    // 0. VPC Stack
    const _VpcStack = new VPCStack(this, 'vpc-Stack', {
      /*env: props.env,*/
    });

    // 1. S3 Stack
    const _S3Stack = new S3Stack(this, 's3-Stack', {
      /*env: props.env,*/
    });

    // 2. RDS Postgre SQL Stack
    const privateSubnets = _VpcStack.vpc.selectSubnets({subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS});
    const _RdsStack = new RDSStack(this, 'rds-Stack', {
        //env: props.env,
        subnets: privateSubnets,
        vpc: _VpcStack.vpc
    });

    // 3. Redis Stack
    const _Redis = new RedisServerlessStack(this, 'redis-Stack', {
        //env: props.env,
        subnets: privateSubnets,
        vpc: _VpcStack.vpc
    });

    // 4. EKS Stack
    const _eksCluster = new EKSClusterStack(this, 'eks-Stack', {
      //env: props.env,
      subnets: privateSubnets,
      vpc: _VpcStack.vpc
    });

    // Deploy ALBC if it doesn't exist
    new ALBCDeploymentStack(this, 'ALBCDeploymentStack', {
        cluster: _eksCluster.cluster,})
      
    const difyHelm = new eks.HelmChart(this, 'DifyHelmChart', {
      cluster: _eksCluster.cluster,
      chart: 'dify',
      repository: 'https://douban.github.io/charts/',
      release: 'dify',
      namespace: 'default',  // 指定命名空间
      values: {
        global: {
          host: 'k8s-default-dify-71b66b6f8a-1241212407.us-west-2.elb.amazonaws.com',
          port: '',
          enableTLS: false,
          image: {
            tag: '0.7.0',
          },
          edition: 'SELF_HOSTED',
          storageType: 's3',
          extraEnvs: [],
          extraBackendEnvs: [
            /* SECRET_KEY is a must, A key used to securely sign session cookies and encrypt sensitive information in the database. This variable needs to be set when starting for the first time.You can use "openssl rand -base64 42" to generate a strong key.*/
            { name: 'SECRET_KEY', value: 'd/BV81Qc0hY4BSYzoVPdG9evGco1YBYIxyGBWOrLRFe4nwbKTYGnHQdI'},
            
            //RDS PG
            { name: 'DB_USERNAME', value: 'postgres' },
            { name: 'DB_PASSWORD', value: '4fzG6V7grLGUbBYKLmwvzsaupfQlD.' },  
            { name: 'DB_HOST', value: 'dify-db.cluster-cwph8hwaravt.ap-northeast-1.rds.amazonaws.com' },
            { name: 'DB_PORT', value: '5432' },
            { name: 'DB_DATABASE', value: 'dify' },
/*
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
            'alb.ingress.kubernetes.io/certificate-arn': 'arn:aws:acm:ap-southeast-1:788668107894:certificate/6404aaf8-6051-4637-8d93-d948932b18b6',
          },
          hosts: [{
            host: 'k8s-default-dify-71b66b6f8a-1241212407.us-west-2.elb.amazonaws.com',
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
          embedded: false
        }
      }
    });
  
  }
}