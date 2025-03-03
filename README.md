# Dify Helm Chart

这个Helm Chart用于在Kubernetes集群上部署[Dify](https://github.com/langgenius/dify) - 一个开源的LLM应用开发平台。

本Helm Chart基于Dify官方提供的docker-compose配置开发，遵循Apache License 2.0许可证分发。

## 目录

- [快速开始](#快速开始)
- [安装](#安装)
- [升级](#升级)
- [配置](#配置)
  - [全局配置](#全局配置)
  - [组件配置](#组件配置)
  - [依赖服务](#依赖服务)
- [生产环境部署清单](#生产环境部署清单)
  - [敏感信息保护](#敏感信息保护)
  - [外部PostgreSQL](#外部postgresql)
  - [外部Redis](#外部redis)
  - [外部对象存储](#外部对象存储)
  - [向量数据库配置](#向量数据库配置)
- [资源优化建议](#资源优化建议)
- [高可用性配置](#高可用性配置)
- [监控与日志](#监控与日志)
- [故障排除](#故障排除)

## 快速开始

创建自定义values文件，保存为`my-values.yaml`：

```yaml
global:
  host: "mydify.example.com"
  enableTLS: false
  image:
    tag: "1.0.0"  # 检查最新版本: https://github.com/langgenius/dify/releases
  extraBackendEnvs:
  - name: SECRET_KEY
    value: "请替换为您自己的密钥"

ingress:
  enabled: true
  className: "nginx"

# 开发环境可使用内置服务，生产环境建议使用外部服务
redis:
  embedded: true
postgresql:
  embedded: true
minio:
  embedded: true
```

安装Chart：


---------------------------------------Need to remove---------------------------------------
```bash
# 添加仓库
helm repo add douban #todo not using douban anymore
helm repo update

# 安装
helm upgrade --install dify douban/dify -f my-values.yaml --namespace dify --create-namespace
```

**重要**: 安装后必须运行数据库迁移，否则实例将无法正常工作：

```bash
# 获取API Pod名称
kubectl get pods -n dify -l app.kubernetes.io/component=api

# 运行迁移
kubectl exec -it <dify-api-pod-name> -n dify -- flask db upgrade
```



## 安装

### 前提条件

- Kubernetes 1.19+
- Helm 3.2.0+
- PV provisioner支持（如果启用持久化存储）
- Ingress控制器（如果启用Ingress）

### 详细安装步骤

1. 添加Helm仓库：

```bash
helm repo add douban https://douban.github.io/charts/
helm repo update
```

2. 创建命名空间（可选）：

```bash
kubectl create namespace dify
```

3. 安装Chart：

```bash
helm upgrade --install dify douban/dify -f my-values.yaml --namespace dify
```

4. 运行数据库迁移：

```bash
kubectl exec -it $(kubectl get pods -n dify -l app.kubernetes.io/component=api -o jsonpath='{.items[0].metadata.name}') -n dify -- flask db upgrade
```

5. 访问Dify：

如果启用了Ingress，可以通过配置的主机名访问Dify。
如果未启用Ingress，可以使用端口转发访问：

```bash
kubectl port-forward svc/dify-frontend 3000:80 -n dify
```

然后在浏览器中访问 http://localhost:3000

## 升级

要升级应用，修改`global.image.tag`为所需版本：

```yaml
global:
  image:
    tag: "1.0.0"
```

然后使用Helm命令升级：

```bash
helm upgrade dify douban/dify -f my-values.yaml --namespace dify
```

**重要**: 升级后必须运行数据库迁移：

```bash
kubectl exec -it $(kubectl get pods -n dify -l app.kubernetes.io/component=api -o jsonpath='{.items[0].metadata.name}') -n dify -- flask db upgrade
```

## 配置

### 全局配置

| 参数 | 描述 | 默认值 |
|------|------|--------|
| `global.host` | 应用主机名 | `"chart-example.local"` |
| `global.port` | 非标准端口（非80/443）时设置 | `""` |
| `global.enableTLS` | 是否启用TLS | `false` |
| `global.image.tag` | 全局镜像标签 | Chart的appVersion |
| `global.edition` | Dify版本 | `"SELF_HOSTED"` |
| `global.storageType` | 存储类型 | `"s3"` |
| `global.extraEnvs` | 注入到所有组件的环境变量 | `[]` |
| `global.extraBackendEnvs` | 注入到后端组件的环境变量 | 见values.yaml |
| `global.labels` | 添加到所有部署的标签 | `{}` |

### 组件配置

Dify包含以下主要组件，每个组件都可以单独配置：

- `frontend`: Web前端
- `api`: API服务
- `worker`: 后台工作进程
- `plugin_daemon`: 插件守护进程
- `sandbox`: 代码沙箱环境

每个组件都支持以下常见配置：

- `replicaCount`: 副本数量
- `image`: 镜像配置
- `resources`: 资源请求和限制
- `nodeSelector`: 节点选择器
- `tolerations`: 容忍配置
- `affinity`: 亲和性配置
- `autoscaling`: 自动扩缩容配置

### 依赖服务

Chart包含以下可选的依赖服务：

- `redis`: 缓存和消息队列
- `postgresql`: 主数据库
- `minio`: 对象存储

每个依赖都可以选择使用内嵌服务或外部服务。

## 生产环境部署清单

上面提供的最小配置适用于实验环境，但**没有任何持久化**。如果重启PostgreSQL或MinIO Pod，所有数据都将丢失！

在投入生产环境前，**必须**完成以下额外工作：

### 敏感信息保护

环境变量如`SECRET_KEY`如果泄露可能造成危害，建议使用Secret或CSI卷进行保护。

使用Secret的示例：

```yaml
global:
  extraBackendEnvs:
  - name: SECRET_KEY
    valueFrom:
      secretKeyRef:
        name: dify
        key: SECRET_KEY
```

创建Secret：

```bash
kubectl create secret generic dify \
  --from-literal=SECRET_KEY=your-secret-key \
  --namespace dify
```

更多信息：[Kubernetes Secrets最佳实践](https://kubernetes.io/docs/concepts/security/secrets-good-practices/)

### 外部PostgreSQL

1. 将`postgresql.embedded`设置为`false`
2. 通过`global.extraBackendEnvs`注入连接信息：

```yaml
global:
  extraBackendEnvs:
  - name: DB_USERNAME
    value: "postgres"
  # 建议使用Secret管理敏感信息，包括密码
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

### 外部Redis

1. 将`redis.embedded`设置为`false`
2. 通过`global.extraBackendEnvs`注入连接信息：

```yaml
global:
  extraBackendEnvs:
  - name: REDIS_HOST
    value: "redis.cache.svc.cluster.local"
  - name: REDIS_PORT
    value: "6379"
  - name: REDIS_DB
    value: "0"
  # 建议使用Secret管理敏感信息
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

### 外部对象存储

#### Amazon S3

1. 将`minio.embedded`设置为`false`
2. 通过`global.extraBackendEnvs`注入连接信息：

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
  # 建议使用Secret管理敏感信息
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

1. 将`minio.embedded`设置为`false`
2. 通过`global.extraBackendEnvs`注入连接信息：

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

### 向量数据库配置

由于向量数据库的复杂性，此组件未包含在Chart中，您需要使用外部向量数据库。同样，您可以注入环境变量来使用它：

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

这不是向量数据库的完整配置，请参考[Dify文档](https://docs.dify.ai/v/zh-hans/getting-started/install-self-hosted/environments)获取更多信息。

## 资源优化建议

为确保Dify在Kubernetes中稳定运行，建议为各组件配置适当的资源请求和限制：

### API服务

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
    size: 10Gi  # 根据插件数量和大小调整
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

## 高可用性配置

为了提高系统的可用性和弹性，建议进行以下配置：

### 增加副本数

```yaml
api:
  replicaCount: 2
worker:
  replicaCount: 2
frontend:
  replicaCount: 2
```

### 启用自动扩缩容

```yaml
api:
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 5
    targetCPUUtilizationPercentage: 80
    targetMemoryUtilizationPercentage: 80
```

### 配置Pod反亲和性

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

## 监控与日志

### Prometheus监控

添加Prometheus注解以启用监控：

```yaml
api:
  podAnnotations:
    prometheus.io/scrape: "true"
    prometheus.io/path: "/metrics"
    prometheus.io/port: "5001"
```

### 日志收集

配置日志收集，例如使用Fluentd：

```yaml
global:
  extraEnvs:
  - name: LOG_LEVEL
    value: "INFO"

api:
  podAnnotations:
    fluentd.io/collect: "true"
```

## 故障排除

### 常见问题

1. **数据库迁移失败**
   - 检查PostgreSQL连接配置
   - 确保数据库用户有足够权限

2. **无法连接到Redis**
   - 验证Redis连接信息
   - 检查Redis密码是否正确

3. **文件上传失败**
   - 检查对象存储配置
   - 验证存储桶权限

4. **插件加载失败**
   - 检查plugin_daemon的存储配置
   - 验证插件权限设置

### 获取帮助

如果您在部署过程中遇到困难，请参考：
- [Dify官方文档](https://docs.dify.ai/)
- [Dify GitHub仓库](https://github.com/langgenius/dify)
- [提交Issue](https://github.com/langgenius/dify/issues)
