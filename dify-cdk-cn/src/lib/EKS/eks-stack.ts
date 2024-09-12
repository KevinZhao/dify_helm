import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as fs from 'fs';
import * as path from 'path';
import { KubectlV30Layer } from '@aws-cdk/lambda-layer-kubectl-v30';
import { Construct } from 'constructs';
import * as child_process from 'child_process';

export interface EKSClusterStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  subnets: ec2.ISubnet[];

  // S3 props
  s3BucketName: string;
  s3Endpoint: string;
  s3AccessKey: string;
  s3SecretKey: string;

  // RDSStack props
  rdsSecretArn: string;
  rdsClusterEndpointHostname: string;
  rdsClusterEndpointPort: string;
  rdsUserName: string;
  rdsDbName: string;
}

export class EKSClusterStack extends cdk.Stack {
  private cluster: eks.Cluster;

  constructor(scope: Construct, id: string, props: EKSClusterStackProps) {
    super(scope, id, props);

    this.createEKSCluster(props);
    this.setupSecretsManager(props);
    this.installCSIDriver();
    this.setupALBController();
    this.deployDifyHelmChart(props);
  }

  private createEKSCluster(props: EKSClusterStackProps) {
    this.cluster = new eks.Cluster(this, 'DifyEKSCluster', {
      version: eks.KubernetesVersion.V1_30,
      kubectlLayer: new KubectlV30Layer(this, 'KubectlLayer'),
      vpc: props.vpc,
      vpcSubnets: [{ subnets: props.subnets }],
      defaultCapacity: 2,
      defaultCapacityInstance: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
    });
  }

  private setupSecretsManager(props: EKSClusterStackProps) {
    const eksSecretsAccessRole = new iam.Role(this, 'EKSSecretsAccessRole', {
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com'),
      description: 'IAM role for EKS to access Secrets Manager',
    });

    const rdsSecret = secretsmanager.Secret.fromSecretCompleteArn(this, 'RDSSecret', props.rdsSecretArn);
    rdsSecret.grantRead(eksSecretsAccessRole);

    const serviceAccount = this.cluster.addServiceAccount('SecretsManagerServiceAccount', {
      name: 'secrets-manager-sa',
      namespace: 'default',
    });

    serviceAccount.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('SecretsManagerReadWrite')
    );

    this.createSecretProviderClass(props.rdsSecretArn);
  }

  private installCSIDriver() {
    this.cluster.addHelmChart('SecretsStoreCSIDriver', {
      chart: 'secrets-store-csi-driver',
      repository: 'https://kubernetes-sigs.github.io/secrets-store-csi-driver/charts',
      namespace: 'kube-system',
      release: 'secrets-store-csi-driver',
    });

    this.cluster.addHelmChart('AWSSecretsManagerConfigProvider', {
      chart: 'secrets-store-csi-driver-provider-aws',
      repository: 'https://aws.github.io/secrets-store-csi-driver-provider-aws',
      namespace: 'kube-system',
      release: 'secrets-store-csi-driver-provider-aws',
    });
  }

  private createSecretProviderClass(rdsSecretArn: string) {
    this.cluster.addManifest('RDSSecretProviderClass', {
      apiVersion: 'secrets-store.csi.x-k8s.io/v1',
      kind: 'SecretProviderClass',
      metadata: {
        name: 'aws-rds-secrets',
        namespace: 'default',
      },
      spec: {
        provider: 'aws',
        parameters: {
          objects: JSON.stringify([{
            objectName: rdsSecretArn,
            objectType: 'secretsmanager',
          }]),
        },
      },
    });
  }

  private setupALBController() {
    const policyFilePath = path.join(__dirname, 'iam-policy.json');
    const policyJson = JSON.parse(fs.readFileSync(policyFilePath, 'utf-8'));

    const albServiceAccount = this.cluster.addServiceAccount('ALBServiceAccount', {
      name: 'aws-load-balancer-controller',
      namespace: 'kube-system',
    });
    const albPolicy = new iam.Policy(this, 'ALBControllerPolicy');

    // Apply the policy statements
    policyJson.Statement.forEach((statement: any) => {
      albPolicy.addStatements(iam.PolicyStatement.fromJson(statement));
    });

    albServiceAccount.role.attachInlinePolicy(albPolicy);

    this.cluster.addHelmChart('ALBController', {
      chart: 'aws-load-balancer-controller',
      release: 'aws-load-balancer-controller',
      repository: 'https://aws.github.io/eks-charts',
      namespace: 'kube-system',
      values: {
        clusterName: this.cluster.clusterName,
        serviceAccount: {
          create: false,
          name: albServiceAccount.serviceAccountName,
        },
      },
    });
  }

  private deployDifyHelmChart(props: EKSClusterStackProps) {
    new eks.HelmChart(this, 'DifyHelmChart', {
      cluster: this.cluster,
      chart: 'dify',
      repository: 'https://douban.github.io/charts/',
      release: 'dify',
      namespace: 'default',
      values: this.getDifyHelmChartValues(props),
    });
  }

  private getDifyHelmChartValues(props: EKSClusterStackProps) {
    return {
      global: {
        host: '',
        port: '',
        enableTLS: false,
        image: {
          tag: '0.7.2',
        },
        edition: 'SELF_HOSTED',
        storageType: 's3',
        extraEnvs: [],
        extraBackendEnvs: this.getDifyBackendEnvs(props),
        labels: []
      },
      ingress: this.getIngressConfig(),
      serviceAccount: {
        create: true,
        annotations: {},
        name: '',
      },
      frontend: this.getFrontendConfig(),
    };
  }

  private getDifyBackendEnvs(props: EKSClusterStackProps) {
    const secretKey = this.generateSecretKey();
    return [
      { name: 'SECRET_KEY', value: secretKey },
      { name: 'DEBUG', value: 'true'}, // turn on debug mode
      { name: 'DEPLOY_ENV', value: 'TESTING' }, // PRODUCTION

      // S3 values come from ../S3/s3-stack.ts
      { name: 'S3_ENDPOINT', value: '' },
      { name: 'S3_BUCKET_NAME', value: props.s3BucketName },
      { name: 'S3_ACCESS_KEY', value: '' },
      { name: 'S3_SECRET_KEY', value: '' },

      // RDS values come from ../RDS/rds-stack.ts
      { name: 'DB_USERNAME', value: props.rdsUserName },
      { name: 'DB_PASSWORD', value: '' }, // TODO: get password from secret arn
      { name: 'DB_HOST', value: props.rdsClusterEndpointHostname },
      { name: 'DB_PORT', value: props.rdsClusterEndpointPort },
      { name: 'DB_DATABASE', value: props.rdsDbName },

      // OpenSearch values come from ../AOS/aos-stack.ts
      { name: 'VECTOR_STORE', value: '' },
      { name: 'OPENSEARCH_HOST', value: '' },
      { name: 'OPENSEARCH_PORT', value: '443' },
      { name: 'OPENSEARCH_USERNAME', value: '' },
      { name: 'OPENSEARCH_PASSWORD', value: '' },
      { name: 'OPENSEARCH_SECURE', value: 'true' },

      // Redis values come from ../REDIS/redis-stack.ts
      { name: 'REDIS_HOST', value: '' },
      { name: 'REDIS_PORT', value: '' },
      { name: 'REDIS_DB', value: '' },
      { name: 'REDIS_USE_SSL', value: 'true' },
      { name: 'CELERY_BROKER_URL', value: '' },
    ];
  }

  private getIngressConfig() {
    return {
      enabled: true,
      className: 'alb',
      annotations: {
        'kubernetes.io/ingress.class': 'alb',
        'alb.ingress.kubernetes.io/scheme': 'internet-facing',
        'alb.ingress.kubernetes.io/target-type': 'ip',
        'alb.ingress.kubernetes.io/listen-ports': '[{"HTTP": 80}]',
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
    };
  }

  private getFrontendConfig() {
    return {
      replicaCount: 1,
      image: {
        repository: 'langgenius/dify-web',
        pullPolicy: 'IfNotPresent',
        tag: '',
      },
      envs: [],
      imagePullSecrets: [],
      podAnnotations: {},
      podSecurityContext: {},
      securityContext: {},
      service: {
        type: 'ClusterIP',
        port: 80
      },
      containerPort: 3000,
      resources: {},
      autoscaling: {}
    };
  }

  private generateSecretKey(): string {
  try {
    const openSslOutput = child_process.execSync('openssl rand -base64 42').toString().trim();
    return openSslOutput;
  } catch (error) {
    throw new Error('Failed to generate SECRET_KEY: ' + error);
  }
}
}
