import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

// Local definition
import * as eks from 'aws-cdk-lib/aws-eks';

interface DifyHelmStackProps extends cdk.StackProps {
  cluster: eks.Cluster;
}

export class DifyHelmStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DifyHelmStackProps) {
    super(scope, id, props);

    // Here comes dify helm configuration  
    const difyHelm = new eks.HelmChart(this, 'DifyHelmChart', {
      cluster: props.cluster,
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
            tag: '0.8.0',
          },
          edition: 'SELF_HOSTED',
          storageType: 's3',
          extraEnvs: [],
          extraBackendEnvs: [
            /* SECRET_KEY is a must, A key used to securely sign session cookies and encrypt sensitive information in the database. This variable needs to be set when starting for the first time.You can use "openssl rand -base64 42" to generate a strong key. */
            { name: 'SECRET_KEY', value: 'd/BV81Qc0hY4BSYzoVPdG9evGco1YBYIxyGBWOrLRFe4nwbKTYGnHQdI'},
            { name: 'LOG_LEVEL', value: 'DEBUG'},

            // RDS
            /*{ name: 'DB_USERNAME', value: 'postgres' },
            { name: 'DB_PASSWORD', value: 'JCuluAdANp1yVS7dErCFbtv0_zD4n1' },  
            { name: 'DB_HOST', value: _RdsStack.cluster.clusterEndpoint.hostname },
            { name: 'DB_PORT', value: _RdsStack.cluster.clusterEndpoint.port.toString() },
            { name: 'DB_DATABASE', value: 'dify' },*/

            
            //Opensearch
            { name: 'VECTOR_STORE', value: 'opensearch' },
            { name: 'OPENSEARCH_HOST', value: 'vpc-dify-aos-dqgsvs3ce6wwzrmsvn3row7e5y.us-east-1.es.amazonaws.com' },
            { name: 'OPENSEARCH_PORT', value: '443'},
            { name: 'OPENSEARCH_USERNAME', value: 'admin' },
            { name: 'OPENSEARCH_PASSWORD', value: '1qaz@WSX' },
            { name: 'OPENSEARCH_SECURE', value: 'true' },

            /*
            // Redis Serverless
            { name: 'REDIS_HOST', value: _Redis.cluster.attrEndpointAddress },  
            { name: 'REDIS_PORT', value: _Redis.cluster.attrEndpointPort.toString() },
            { name: 'REDIS_DB', value: '0' },
            { name: 'REDIS_USE_SSL', value: 'true' },
            { name: 'CELERY_BROKER_URL', value: 'redis://' + _Redis.cluster.attrEndpointAddress + ':' + _Redis.cluster.attrEndpointPort.toString() + '/0'},*/

            
            // S3
            //{ name: 'S3_ENDPOINT', value: 'https://' + _S3Stack.bucket.bucketDomainName },
            /*{ name: 'S3_ENDPOINT', value: 'https://' + _S3Stack.bucket.bucketName + '.s3.' + this.region + '.' + 'amazonaws.com' },
            { name: 'S3_BUCKET_NAME', value: _S3Stack.bucket.bucketName },
            { name: 'S3_ACCESS_KEY', value: '' },
            { name: 'S3_SECRET_KEY', value: '' },
            { name: 'S3_Region', value: this.region},*/
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
            tag: ''
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
            limits: { cpu: '2', memory: '2Gi' },
            requests: { cpu: '1', memory: '1Gi' }
          },

          livenessProbe: {
            httpGet: {
              path: '/health',
              port: 'http'
            },
            initialDelaySeconds: 360,
            timeoutSeconds: 10,
            periodSeconds: 30,
            successThreshold: 1,
            failureThreshold: 5
          },
          readinessProbe: {
            httpGet: {
              path: '/health',
              port: 'http'
            },
            initialDelaySeconds: 120,
            timeoutSeconds: 10,
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
            tag: ''
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

        redis: {
          embedded: true, 
        },

        postgresql:{
          embedded: true,
          architecture: 'standalone',
          auth: {
            postgresPassword: 'testpassword',
            database: 'dify',
          },
          primary: {
            persistence: {
              enabled: false,
            },
          },
        },

        minio:{
          embedded: true,
        },

      }
    });
  
  }
}