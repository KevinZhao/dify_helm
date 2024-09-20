import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

// Local definition
import * as eks from 'aws-cdk-lib/aws-eks';

interface DifyHelmStackProps extends cdk.StackProps {
    cluster: eks.Cluster;

    // RDS
    dbEndpoint: string;
    dbPort: string;
    dbName: string;

    // S3
    s3BucketName: string;

    // Redis
    redisEndpoint: string;
    redisPort: string;

    // OpenSearch
    openSearchEndpoint: string;
}

export class DifyHelmStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: DifyHelmStackProps) {
        super(scope, id, props);

        const dbPassword = this.node.tryGetContext('dbPassword');
        if (!dbPassword) {
            throw new Error("Context variable 'dbPassword' is missing");
        }

        const opensearchPassword = this.node.tryGetContext('opensearchPassword');
        if (!opensearchPassword) {
            throw new Error("Context variable 'opensearchPassword' is missing");
        }

        const S3AccessKey = this.node.tryGetContext('S3AccessKey');
        if (!S3AccessKey) {
            throw new Error("Context variable 'S3AccessKey' is missing");
        }

        const S3SecretKey = this.node.tryGetContext('S3SecretKey');
        if (!S3SecretKey) {
            throw new Error("Context variable 'S3SecretKey' is missing");
        }

        // Here comes dify helm configuration  
        const difyHelm = new eks.HelmChart(this, 'DifyHelmChart', {
            cluster: props.cluster,
            chart: 'dify',
            repository: 'https://douban.github.io/charts/',
            release: 'dify',
            namespace: 'default',
            values: {
                global: {
                    //Specify your host on ALB DNS name
                    host: 'k8s-default-dify-324ef51b8a-1404288550.cn-northwest-1.elb.amazonaws.com.cn',
                    port: '80',
                    enableTLS: false,
                    image: {
                        tag: '0.8.2',
                    },
                    edition: 'SELF_HOSTED',
                    storageType: 's3',
                    extraEnvs: [],
                    extraBackendEnvs: [
                        /* SECRET_KEY is a must, A key used to securely sign session cookies and encrypt sensitive information in the database. This variable needs to be set when starting for the first time.You can use "openssl rand -base64 42" to generate a strong key. */
                        { name: 'SECRET_KEY', value: '9QImE6jta7cBjteIVG65klCp9EOXjxD/oVWDCTsbE0qwo3uT5AZNrXDD' },
                        { name: 'LOG_LEVEL', value: 'DEBUG' },

                        // RDS Postgres
                        { name: 'DB_USERNAME', value: 'postgres' },
                        { name: 'DB_PASSWORD', value: dbPassword },
                        { name: 'DB_HOST', value: props.dbEndpoint },
                        { name: 'DB_PORT', value: props.dbPort },
                        { name: 'DB_DATABASE', value: props.dbName },

                        //Opensearch
                        { name: 'VECTOR_STORE', value: 'opensearch' },
                        { name: 'OPENSEARCH_HOST', value: props.openSearchEndpoint },
                        { name: 'OPENSEARCH_PORT', value: '443' },
                        { name: 'OPENSEARCH_USER', value: 'admin' },
                        { name: 'OPENSEARCH_PASSWORD', value: opensearchPassword },
                        { name: 'OPENSEARCH_SECURE', value: 'true' },

                        // Redis 
                        { name: 'REDIS_HOST', value: props.redisEndpoint },
                        { name: 'REDIS_PORT', value: props.redisPort },
                        { name: 'REDIS_DB', value: '0' },
                        { name: 'REDIS_USERNAME', value: '' },
                        { name: 'REDIS_PASSWORD', value: '' },
                        { name: 'REDIS_USE_SSL', value: 'true' },

                        // CELERY_BROKER
                        { name: 'CELERY_BROKER_URL', value: 'redis://' + ':@' + props.redisEndpoint + ':' + props.redisPort + '/1' },

                        { name: 'BROKER_USE_SSL', value: 'true' },

                        // S3
                        { name: 'S3_ENDPOINT', value: 'https://' + props.s3BucketName + '.s3.' + this.region + '.amazonaws.com.cn' },
                        { name: 'S3_BUCKET_NAME', value: props.s3BucketName },
                        { name: 'S3_ACCESS_KEY', value: S3AccessKey },
                        { name: 'S3_SECRET_KEY', value: S3SecretKey },
                        { name: 'S3_REGION', value: this.region },
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
                        host: 'k8s-default-dify-324ef51b8a-1404288550.cn-northwest-1.elb.amazonaws.com.cn',
                        paths: [
                            {
                                path: '/api',
                                pathType: 'Prefix',
                                backend: {
                                    serviceName: 'dify-api-svc',
                                    servicePort: 80
                                },
                                annotations: {
                                    'alb.ingress.kubernetes.io/healthcheck-path': '/health',
                                    'alb.ingress.kubernetes.io/healthcheck-port': '80'
                                }
                            },
                            {
                                path: '/v1',
                                pathType: 'Prefix',
                                backend: {
                                    serviceName: 'dify-api-svc',
                                    servicePort: 80
                                },
                                annotations: {
                                    'alb.ingress.kubernetes.io/healthcheck-path': '/health',
                                    'alb.ingress.kubernetes.io/healthcheck-port': '80'
                                }
                            },
                            {
                                path: '/console/api',
                                pathType: 'Prefix',
                                backend: {
                                    serviceName: 'dify-api-svc',
                                    servicePort: 80
                                },
                                annotations: {
                                    'alb.ingress.kubernetes.io/healthcheck-path': '/health',
                                    'alb.ingress.kubernetes.io/healthcheck-port': '80'
                                }
                            },
                            {
                                path: '/files',
                                pathType: 'Prefix',
                                backend: {
                                    serviceName: 'dify-api-svc',
                                    servicePort: 80
                                },
                                annotations: {
                                    'alb.ingress.kubernetes.io/healthcheck-path': '/health',
                                    'alb.ingress.kubernetes.io/healthcheck-port': '80'
                                }
                            },
                            {
                                path: '/',
                                pathType: 'Prefix',
                                backend: {
                                    serviceName: 'dify-frontend',
                                    servicePort: 80
                                },
                                annotations: {
                                    'alb.ingress.kubernetes.io/healthcheck-path': '/apps',
                                    'alb.ingress.kubernetes.io/healthcheck-port': '80'
                                }
                            }
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
                        repository: '772532280796.dkr.ecr.cn-northwest-1.amazonaws.com.cn/langgenius/dify-web',
                        pullPolicy: 'IfNotPresent',
                        tag: ''
                    },
                    envs: [
                    ],
                    imagePullSecrets: [],
                    podAnnotations: {},
                    podSecurityContext: {

                    },
                    securityContext: {

                    },
                    service: {
                        type: 'ClusterIP',
                        port: 80
                    },

                    containerPort: 3000,
                    resources: {
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
                        repository: '772532280796.dkr.ecr.cn-northwest-1.amazonaws.com.cn/langgenius/dify-api',
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
                        port: 80
                    },

                    containerPort: 5001,
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
                        repository: '772532280796.dkr.ecr.cn-northwest-1.amazonaws.com.cn/langgenius/dify-api',
                        pullPolicy: 'IfNotPresent',
                        tag: ''
                    },
                    podAnnotations: {},
                    podSecurityContext: {},
                    securityContext: {},
                    resources: {
                    },
                    autoscaling: {
                        enabled: false,
                        minReplicas: 1,
                        maxReplicas: 100,
                        targetCPUUtilizationPercentage: 80
                    },
                    livenessProbe: {

                    },
                    readinessProbe: {

                    }
                },

                sandbox: {
                    replicaCount: 1,
                    apiKey: 'dify-sandbox',
                    apiKeySecret: '',
                    image: {
                        repository: '772532280796.dkr.ecr.cn-northwest-1.amazonaws.com.cn/langgenius/dify-sandbox',
                        pullPolicy: 'IfNotPresent',
                        tag: 'latest'
                    },
                    config: {
                        python_requirements: ''
                    },
                    envs: [
                        { name: 'GIN_MODE', value: 'release' },
                        { name: 'WORKER_TIMEOUT', value: '15' }
                    ],
                    service: {
                        type: 'ClusterIP',
                        port: 80
                    },
                    containerPort: 8194,
                    resources: {
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
                    embedded: false,
                },

                postgresql: {
                    embedded: false,
                },

                minio: {
                    embedded: false,
                },

            }
        });
    }
}