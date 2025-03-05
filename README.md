# Dify Helm Chart

This Helm Chart is designed for deploying [Dify](https://github.com/langgenius/dify), an open-source LLM application development platform, on Kubernetes clusters.

This Helm Chart was developed based on Dify's official docker-compose configuration and is distributed under the Apache License 2.0.

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Upgrading](#upgrading)
- [Configuration](#configuration)
  - [Global Configuration](#global-configuration)
  - [Component Configuration](#component-configuration)
  - [Dependent Services](#dependent-services)
- [Production Deployment Checklist](#production-deployment-checklist)
  - [Sensitive Information Protection](#sensitive-information-protection)
  - [External PostgreSQL](#external-postgresql)
  - [External Redis](#external-redis)
  - [External Object Storage](#external-object-storage)
  - [Vector Database Configuration](#vector-database-configuration)
- [Resource Optimization](#resource-optimization)
- [High Availability Configuration](#high-availability-configuration)
- [Monitoring and Logging](#monitoring-and-logging)
- [Troubleshooting](#troubleshooting)

## Quick Start

Create a custom values file, save it as `my-values.yaml`:

```yaml
global:
  host: "mydify.example.com"
  enableTLS: false
  image:
    tag: "1.0.0"  # Check latest version: https://github.com/langgenius/dify/releases
  extraBackendEnvs:
  - name: SECRET_KEY
    value: "please-replace-with-your-own-secret"

ingress:
  enabled: true
  className: "nginx"

# Embedded services for development. For production, use external services
redis:
  embedded: true
postgresql:
  embedded: true
minio:
  embedded: true
```

Install the Chart:

```bash
# Add repository
helm repo add dify-repo <repository-url>
helm repo update

# Install
helm upgrade --install dify dify-repo/dify -f my-values.yaml --namespace dify --create-namespace
```

**Important**: After installation, you must run database migrations or the instance will not work properly:

```bash
# Get API Pod name
kubectl get pods -n dify -l app.kubernetes.io/component=api

# Run migration
kubectl exec -it <dify-api-pod-name> -n dify -- flask db upgrade
```

## Installation

### Prerequisites

- Kubernetes 1.19+
- Helm 3.2.0+
- PV provisioner support (if persistence is enabled)
- Ingress controller (if Ingress is enabled)

### Detailed Installation Steps

1. Add the Helm repository:

```bash
helm repo add dify-repo <repository-url>
helm repo update
```

2. Create namespace (optional):

```bash
kubectl create namespace dify
```

3. Install the Chart:

```bash
helm upgrade --install dify dify-repo/dify -f my-values.yaml --namespace dify
```

4. Run database migrations:

```bash
kubectl exec -it $(kubectl get pods -n dify -l app.kubernetes.io/component=api -o jsonpath='{.items[0].metadata.name}') -n dify -- flask db upgrade
```

5. Access Dify:

If Ingress is enabled, access Dify through the configured hostname.
If Ingress is not enabled, use port-forwarding:

```bash
kubectl port-forward svc/dify-frontend 3000:80 -n dify
```

Then visit http://localhost:3000 in your browser.

## Upgrading

To upgrade the application, modify `global.image.tag` to the desired version:

```yaml
global:
  image:
    tag: "1.0.0"
```

Then upgrade using the Helm command:

```bash
helm upgrade dify dify-repo/dify -f my-values.yaml --namespace dify
```

**Important**: After upgrading, you must run database migrations:

```bash
kubectl exec -it $(kubectl get pods -n dify -l app.kubernetes.io/component=api -o jsonpath='{.items[0].metadata.name}') -n dify -- flask db upgrade
```

## Configuration

### Global Configuration

| Parameter | Description | Default |
|------|------|--------|
| `global.host` | Application hostname | `"chart-example.local"` |
| `global.port` | Set for non-standard ports (not 80/443) | `""` |
| `global.enableTLS` | Enable TLS | `false` |
| `global.image.tag` | Global image tag | Chart's appVersion |
| `global.edition` | Dify version | `"SELF_HOSTED"` |
| `global.storageType` | Storage type | `"s3"` |
| `global.extraEnvs` | Environment variables for all components | `[]` |
| `global.extraBackendEnvs` | Environment variables for backend components | See values.yaml |
| `global.labels` | Labels added to all deployments | `{}` |

### Component Configuration

Dify includes these main components, each configurable individually:

- `frontend`: Web frontend
- `api`: API service
- `worker`: Background worker process
- `plugin_daemon`: Plugin daemon
- `sandbox`: Code sandbox environment

Each component supports these common configurations:

- `replicaCount`: Number of replicas
- `image`: Image configuration
- `resources`: Resource requests and limits
- `nodeSelector`: Node selector
- `tolerations`: Tolerations
- `affinity`: Affinity settings
- `autoscaling`: Autoscaling configuration

### Dependent Services

The chart includes these optional dependent services:

- `redis`: Cache and message queue
- `postgresql`: Main database
- `minio`: Object storage

Each dependency can use either embedded or external services. When `embedded` is set to `true`, the chart will use the official Helm dependencies from Bitnami charts:

```yaml
dependencies:
  - redis: ~17.11.0 (from https://charts.bitnami.com/bitnami)
  - postgresql: ~12.5.0 (from https://charts.bitnami.com/bitnami)
  - minio: ~12.6.0 (from https://charts.bitnami.com/bitnami)
```

After changing dependency configuration, run `helm dependency update` to fetch the required charts.

## Chart Dependencies Management

This chart uses Helm's dependency management to handle Redis, PostgreSQL, and MinIO services. The Chart.yaml file defines these dependencies with specific version requirements. There are two ways to work with these dependencies:

### For Users

When installing from the repository, dependencies are automatically managed through the CI/CD process. You don't need to take any additional actions.

### For Developers

If you're working with this chart locally:

```bash
# Update dependencies (downloads dependency charts to charts/ directory)
helm dependency update

# List all dependencies and their status
helm dependency list
```

If you modify any dependency version in Chart.yaml, make sure to run `helm dependency update` to refresh the charts.

Note: The `charts/` directory is not committed to the repository; dependencies are dynamically downloaded during the CI build process.

## Production Deployment Checklist

The minimal configuration above is suitable for experimentation but **has no persistence**. If PostgreSQL or MinIO Pods restart, all data will be lost!

Before deploying to production, you **must** complete these additional steps:

### Sensitive Information Protection

Several security-sensitive environment variables are required for Dify to function properly. The default values.yaml has these values set to empty - you must provide your own secure values:

```yaml
# Required security keys - MUST be configured with secure values:
- name: SECRET_KEY             # Main application secret key
- name: PLUGIN_DAEMON_KEY      # Plugin daemon authentication key
- name: PLUGIN_DIFY_INNER_API_KEY  # Internal API authentication key
```

You can generate secure random strings using commands like:
```bash
# For SECRET_KEY
openssl rand -base64 42

# For other authentication keys
openssl rand -base64 32
```

Environment variables like these can be harmful if leaked. For production use, use Secrets or CSI volumes for protection.

Example using Secrets:

```yaml
global:
  extraBackendEnvs:
  - name: SECRET_KEY
    valueFrom:
      secretKeyRef:
        name: dify
        key: SECRET_KEY
```

Create the Secret:

```bash
kubectl create secret generic dify \
  --from-literal=SECRET_KEY=your-secret-key \
  --namespace dify
```

For more information: [Kubernetes Secrets Best Practices](https://kubernetes.io/docs/concepts/security/secrets-good-practices/)

### External PostgreSQL

1. Set `postgresql.embedded` to `false`
2. Inject connection information via `global.extraBackendEnvs`:

```yaml
global:
  extraBackendEnvs:
  - name: DB_USERNAME
    value: "postgres"
  # Using Secret for sensitive information is recommended
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: dify-db
        key: DB_PASSWORD
  - name: DB_HOST
    value: "postgres.database.svc.cluster.local"
  - name: DB_PORT
    value: "5432"
  - name: DB_DATABASE
    value: "dify"
```

### External Redis

1. Set `redis.embedded` to `false`
2. Inject connection information via `global.extraBackendEnvs`:

```yaml
global:
  extraBackendEnvs:
  - name: REDIS_HOST
    value: "redis.cache.svc.cluster.local"
  - name: REDIS_PORT
    value: "6379"
  - name: REDIS_DB
    value: "0"
  # Using Secret for sensitive information is recommended
  - name: REDIS_PASSWORD
    valueFrom:
      secretKeyRef:
        name: dify-redis
        key: REDIS_PASSWORD
  - name: CELERY_BROKER_URL
    valueFrom:
      secretKeyRef:
        name: dify-redis
        key: CELERY_BROKER_URL
```

### External Object Storage

#### Amazon S3

1. Set `minio.embedded` to `false`
2. Inject connection information via `global.extraBackendEnvs`:

```yaml
global:
  storageType: "s3"
  extraBackendEnvs:
  - name: S3_ENDPOINT
    value: "https://s3.amazonaws.com"
  - name: S3_BUCKET_NAME
    value: "dify-storage"
  - name: S3_REGION
    value: "us-east-1"
  # Using Secret for sensitive information is recommended
  - name: S3_ACCESS_KEY
    valueFrom:
      secretKeyRef:
        name: dify-s3
        key: S3_ACCESS_KEY
  - name: S3_SECRET_KEY
    valueFrom:
      secretKeyRef:
        name: dify-s3
        key: S3_SECRET_KEY
```

#### Google Cloud Storage

1. Set `minio.embedded` to `false`
2. Inject connection information via `global.extraBackendEnvs`:

```yaml
global:
  storageType: "google-storage"
  extraBackendEnvs:
  - name: GOOGLE_STORAGE_BUCKET_NAME
    value: "dify-storage"
  - name: GOOGLE_STORAGE_SERVICE_ACCOUNT_JSON_BASE64
    valueFrom:
      secretKeyRef:
        name: dify-gcs
        key: GOOGLE_STORAGE_SERVICE_ACCOUNT_JSON_BASE64
```

### Vector Database Configuration

Due to the complexity of vector databases, this component is not included in the Chart. You need to use an external vector database and inject environment variables:

```yaml
global:
  extraBackendEnvs:
  - name: VECTOR_STORE
    value: "milvus"
  - name: MILVUS_HOST
    value: "milvus.vector.svc.cluster.local"
  - name: MILVUS_PORT
    value: "19530"
  - name: MILVUS_COLLECTION_NAME_PREFIX
    value: "dify"
```

This is not a complete vector database configuration. Please refer to [Dify documentation](https://docs.dify.ai/getting-started/install-self-hosted/environments) for more information.

## Resource Optimization

To ensure Dify runs stably in Kubernetes, we recommend configuring appropriate resource requests and limits:

### API Service

```yaml
api:
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 1000m
      memory: 2Gi
```

### Worker

```yaml
worker:
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2000m
      memory: 4Gi
```

### Frontend

```yaml
frontend:
  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi
```

### Plugin Daemon

```yaml
plugin_daemon:
  resources:
    requests:
      cpu: 200m
      memory: 512Mi
    limits:
      cpu: 500m
      memory: 1Gi
  persistence:
    size: 10Gi  # Adjust based on plugin quantity and size
```

### Sandbox

```yaml
sandbox:
  resources:
    requests:
      cpu: 200m
      memory: 512Mi
    limits:
      cpu: 1000m
      memory: 1Gi
```

## High Availability Configuration

To improve system availability and resilience, we recommend these configurations:

### Increase Replicas

```yaml
api:
  replicaCount: 2
worker:
  replicaCount: 2
frontend:
  replicaCount: 2
```

### Enable Autoscaling

```yaml
api:
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 5
    targetCPUUtilizationPercentage: 80
    targetMemoryUtilizationPercentage: 80
```

### Configure Pod Anti-Affinity

```yaml
api:
  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchExpressions:
            - key: app.kubernetes.io/component
              operator: In
              values:
              - api
          topologyKey: "kubernetes.io/hostname"
```

## Monitoring and Logging

### Prometheus Monitoring

Add Prometheus annotations to enable monitoring:

```yaml
api:
  podAnnotations:
    prometheus.io/scrape: "true"
    prometheus.io/path: "/metrics"
    prometheus.io/port: "5001"
```

### Log Collection

Configure log collection, for example using Fluentd:

```yaml
global:
  extraEnvs:
  - name: LOG_LEVEL
    value: "INFO"

api:
  podAnnotations:
    fluentd.io/collect: "true"
```

## Troubleshooting

### Common Issues

1. **Database Migration Failure**
   - Check PostgreSQL connection configuration
   - Ensure database user has sufficient permissions

2. **Cannot Connect to Redis**
   - Verify Redis connection information
   - Check Redis password correctness

3. **File Upload Failure**
   - Check object storage configuration
   - Verify bucket permissions

4. **Plugin Loading Failure**
   - Check plugin_daemon storage configuration
   - Verify plugin permission settings

### Getting Help

If you encounter difficulties during deployment, refer to:
- [Dify Official Documentation](https://docs.dify.ai/)
- [Dify GitHub Repository](https://github.com/langgenius/dify)
- [Submit an Issue](https://github.com/langgenius/dify/issues)
