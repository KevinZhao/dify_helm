import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as eks from 'aws-cdk-lib/aws-eks';

interface LangfuseHelmStackProps extends cdk.StackProps {
  cluster: eks.Cluster;

  // RDS
  dbEndpoint: string;
  dbPort: string;
}

export class LangfuseHelmStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LangfuseHelmStackProps) {
    super(scope, id, props);

    const dbPassword = this.node.tryGetContext('dbPassword');
    if (!dbPassword) {
      throw new Error("Context variable 'dbPassword' is missing");
    }

    const nextAuthSecret = this.node.tryGetContext('nextAuthSecret');
    if (!nextAuthSecret) {
      throw new Error("Context variable 'nextAuthSecret' is missing");
    }

    const salt = this.node.tryGetContext('salt');
    if (!salt) {
      throw new Error("Context variable 'salt' is missing");
    }

    const ns = new eks.KubernetesManifest(this, "langfuse-ns", {
      cluster: props.cluster,
      manifest: [{
        apiVersion: "v1",
        kind: "Namespace",
        metadata: { name: "langfuse" }
      }],
      overwrite: true
    });

    const dbSecret = new eks.KubernetesManifest(this, "langfuse-db-secret", {
      cluster: props.cluster,
      manifest: [{
        apiVersion: "v1",
        kind: "Secret",
        metadata: { name: "langfuse-db-secret", namespace: "langfuse" },
        type: "Opaque",
        data: { password: Buffer.from(dbPassword).toString('base64') }
      }],
      overwrite: true
    });
    dbSecret.node.addDependency(ns);

    const authSecret = new eks.KubernetesManifest(this, "langfuse-auth-secret", {
      cluster: props.cluster,
      manifest: [{
        apiVersion: "v1",
        kind: "Secret",
        metadata: { name: "langfuse-auth-secret", namespace: "langfuse" },
        type: "Opaque",
        data: {
          nextauth_secret: Buffer.from(nextAuthSecret).toString('base64'),
          salt: Buffer.from(salt).toString('base64')
        }
      }],
      overwrite: true
    });
    authSecret.node.addDependency(ns);

    // Langfuse Helm configuration
    const langfuseHelm = new eks.HelmChart(this, 'LangfuseHelmChart', {
      cluster: props.cluster,
      chart: 'langfuse',
      repository: 'https://langfuse.github.io/langfuse-k8s',
      release: 'langfuse',
      namespace: 'langfuse',
      values: {
        langfuse: {
          port: 3000,
          nodeEnv: 'production',
          nextauth: {
            url: `http://localhost:3000}`
          },
          additionalEnv: [
            { name: 'DATABASE_URL', value: `postgresql://postgres:${dbPassword}@${props.dbEndpoint}:${props.dbPort}/postgres` },
            { name: 'NEXTAUTH_SECRET', valueFrom: { secretKeyRef: { name: 'langfuse-auth-secret', key: 'nextauth_secret' } } },
            { name: 'SALT', valueFrom: { secretKeyRef: { name: 'langfuse-auth-secret', key: 'salt' } } },
            { name: 'LANGFUSE_LOG_LEVEL', value: 'info' },
            { name: 'LANGFUSE_LOG_FORMAT', value: 'json' }
          ]
        },
        ingress: {
          enabled: true,
          className: 'alb',
          annotations: {
            'kubernetes.io/ingress.class': 'alb',
            'alb.ingress.kubernetes.io/scheme': 'internet-facing',
            'alb.ingress.kubernetes.io/target-type': 'ip',
            'alb.ingress.kubernetes.io/listen-ports': '[{"HTTP": 80}]'
          },
          hosts: [{
            host: '',
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: { serviceName: 'langfuse', servicePort: 3000 }
              }
            ]
          }]
        }
      }
    });
  }
}