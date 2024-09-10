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


    // Here comes dify helm configuration  
    const difyHelm = new eks.HelmChart(this, 'DifyHelmChart', {
      cluster: _eksCluster.cluster,
      chart: 'dify',
      repository: 'https://douban.github.io/charts/',
      release: 'dify',
      namespace: 'default',  // 指定命名空间
      values: {
        global: {
          //Specify your host on ALB DNS name
          host: '',
          port: '',
          enableTLS: false,
          image: {
            tag: '0.7.0',
          },
          edition: 'SELF_HOSTED',
          storageType: 's3',
          extraEnvs: [],
          extraBackendEnvs: [
            /* SECRET_KEY is a must, A key used to securely sign session cookies and encrypt sensitive information in the database. This variable needs to be set when starting for the first time.You can use "openssl rand -base64 42" to generate a strong key. */
            { name: 'SECRET_KEY', value: 'd/BV81Qc0hY4BSYzoVPdG9evGco1YBYIxyGBWOrLRFe4nwbKTYGnHQdI'},
            { name: 'DB_USERNAME', value: 'postgres' },
            { name: 'DB_PASSWORD', value: '' },  
            { name: 'DB_HOST', value: '' },
            { name: 'DB_PORT', value: '5432' },
            { name: 'DB_DATABASE', value: 'dify' },
            { name: 'S3_ENDPOINT', value: '' },
            { name: 'S3_BUCKET_NAME', value: '' },
            { name: 'S3_ACCESS_KEY', value: '' },
            { name: 'S3_SECRET_KEY', value: '' },
          ],
          labels: []
        },

        ingress: {
          enabled: true,
          className: 'alb',
          annotations: {
            'kubernetes.io/ingress.class': 'alb',
            'alb.ingress.kubernetes.io/scheme': 'internet-facing',
            'alb.ingress.kubernetes.io/target-type': 'ip',
            'alb.ingress.kubernetes.io/listen-ports': '[{"HTTP": 80}]',
            //'alb.ingress.kubernetes.io/listen-ports': '[{"HTTPS": 443}]',
            //'alb.ingress.kubernetes.io/certificate-arn': 'arn:aws:acm:ap-southeast-1:788668107894:certificate/6404aaf8-6051-4637-8d93-d948932b18b6',
          },
          hosts: [{
            host: '',
            paths: [
              { path: '/api', pathType: 'Prefix', backend: { serviceName: 'dify-api-svc', servicePort: 80 } },
              { path: '/v1', pathType: 'Prefix', backend: { serviceName: 'dify-api-svc', servicePort: 80 } },
              { path: '/console/api', pathType: 'Prefix', backend: { serviceName: 'dify-api-svc', servicePort: 80 } },
              { path: '/files', pathType: 'Prefix', backend: { serviceName: 'dify-api-svc', servicePort: 80 } },
              { path: '/', pathType: 'Prefix', backend: { serviceName: 'dify-frontend', servicePort: 80 } },
            ]
          }]
        },

        serviceAccount: {
          create: true, 
          annotations: {
          },
          name: '',
        },

        frontend: {
          replicaCount: 1,

          image: {
            repository: 'langgenius/dify-web',
            pullPolicy: 'IfNotPresent',
            tag: '' // 可以设置为特定的版本，如 "0.7.0"
          },
          envs: [
          ],
          imagePullSecrets: [], // 如果需要从私有镜像仓库拉取镜像，这里可以设置
          podAnnotations: {},
          podSecurityContext: {
            // fsGroup: 2000
          },
          securityContext: {
            // runAsNonRoot: true, // 如果需要设置为非 root 用户运行
          },
          service: {
            type: 'ClusterIP',
            port: 80 // frontend 监听的端口
          },
          containerPort: 3000, // 前端容器的端口
          resources: {
            // 可以根据需求设置资源请求和限制
            // limits: { cpu: '500m', memory: '512Mi' },
            // requests: { cpu: '200m', memory: '256Mi' }
          },
          autoscaling: {
            enabled: false,
            minReplicas: 1,
            maxReplicas: 100,
            targetCPUUtilizationPercentage: 80
          },

          livenessProbe: {
            httpGet: {
              path: '/apps',
              port: 'http',
              httpHeaders: [{ name: 'accept-language', value: 'en' }]
            },
            initialDelaySeconds: 3,
            timeoutSeconds: 5,
            periodSeconds: 30,
            successThreshold: 1,
            failureThreshold: 2
          },

          readinessProbe: {
            httpGet: {
              path: '/apps',
              port: 'http',
              httpHeaders: [{ name: 'accept-language', value: 'en' }]
            },
            initialDelaySeconds: 3,
            timeoutSeconds: 5,
            periodSeconds: 30,
            successThreshold: 1,
            failureThreshold: 2
          }
        },

        api: {
          replicaCount: 1,
          image: {
            repository: 'langgenius/dify-api',
            pullPolicy: 'IfNotPresent',
            tag: '' // 可以设置为特定的版本，如 "0.7.0"
          },
          envs: [
            { name: 'CODE_MAX_NUMBER', value: '9223372036854775807' },
            { name: 'CODE_MIN_NUMBER', value: '-9223372036854775808' },
            { name: 'CODE_MAX_STRING_LENGTH', value: '80000' },
            { name: 'TEMPLATE_TRANSFORM_MAX_LENGTH', value: '80000' },
            { name: 'CODE_MAX_STRING_ARRAY_LENGTH', value: '30' },
            { name: 'CODE_MAX_OBJECT_ARRAY_LENGTH', value: '30' },
            { name: 'CODE_MAX_NUMBER_ARRAY_LENGTH', value: '1000' }
          ],
          podAnnotations: {},
          podSecurityContext: {},
          securityContext: {},

          service: {
            type: 'ClusterIP',
            port: 80 // api service 监听的端口
          },

          containerPort: 5001, // API 容器端口
          resources: {
            // 可以根据需求设置资源请求和限制
          },

          livenessProbe: {
            httpGet: {
              path: '/health',
              port: 'http'
            },
            initialDelaySeconds: 30,
            timeoutSeconds: 5,
            periodSeconds: 30,
            successThreshold: 1,
            failureThreshold: 2
          },
          readinessProbe: {
            httpGet: {
              path: '/health',
              port: 'http'
            },
            initialDelaySeconds: 10,
            timeoutSeconds: 5,
            periodSeconds: 5,
            successThreshold: 1,
            failureThreshold: 10
          }
        },

        worker: {
          replicaCount: 1,
          image: {
            repository: 'langgenius/dify-api',
            pullPolicy: 'IfNotPresent',
            tag: '' // 可以设置为特定的版本，如 "0.7.0"
          },
          podAnnotations: {},
          podSecurityContext: {},
          securityContext: {},
          resources: {
            // 设置 worker 资源限制
          },
          autoscaling: {
            enabled: false,
            minReplicas: 1,
            maxReplicas: 100,
            targetCPUUtilizationPercentage: 80
          },
          livenessProbe: {
            // Worker 的存活探针可以根据你的应用程序设置
          },
          readinessProbe: {
            // Worker 的就绪探针可以根据你的应用程序设置
          }
        },

        sandbox: {
          replicaCount: 1,
          apiKey: 'dify-sandbox', // 请设置自己的 Sandbox API Key
          apiKeySecret: '', // 可以使用 Secret 管理密钥
          image: {
            repository: 'langgenius/dify-sandbox',
            pullPolicy: 'IfNotPresent',
            tag: '' // 可以设置为特定的版本
          },
          config: {
            python_requirements: '' // 这里可以添加 Sandbox 环境中需要的 Python 库
          },
          envs: [
            { name: 'GIN_MODE', value: 'release' },
            { name: 'WORKER_TIMEOUT', value: '15' }
          ],
          service: {
            type: 'ClusterIP',
            port: 80 // sandbox service 监听的端口
          },
          containerPort: 8194, // sandbox 容器端口
          resources: {
            // 可以根据需求设置资源请求和限制
          },
          readinessProbe: {
            tcpSocket: {
              port: 'http'
            },
            initialDelaySeconds: 1,
            timeoutSeconds: 5,
            periodSeconds: 5,
            successThreshold: 1,
            failureThreshold: 10
          },
          livenessProbe: {
            tcpSocket: {
              port: 'http'
            },
            initialDelaySeconds: 30,
            timeoutSeconds: 5,
            periodSeconds: 30,
            successThreshold: 1,
            failureThreshold: 2
          }
        },

        /*redis: {
          embedded: true, // 使用内嵌的 Redis
          architecture: 'standalone', // 独立模式
          auth: {
            password: 'REDIS_PASSWORD' // 设置 Redis 密码
          },
          master: {
            persistence: {
              enabled: false, // 禁用持久化
              size: '8Gi' // 如果启用持久化，可以设置大小
            }
          }
        }*/

      }
    });
  
  }
}