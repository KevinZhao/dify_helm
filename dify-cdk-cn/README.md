# Deploy dify on EKS in AWS China Region

## Prerequisites

### 1. 切换到中国区部署 work folder
```bash
cd dify-cdk-cn
```

### 2. 准备 CDK 环境
```bash
sudo dnf install nodejs git -y
sudo npm install -g aws-cdk 
sudo npm install -g typescript ts-node
```

### 3. 配置 AWS CLI profile
```bash
aws configure --profile {china_region_profile}
export AWS_PROFILE={china_region_profile}
```

### 4. 准备开发和部署环境
```bash
cdk bootstrap (only for the 1st time)
npm run build
```

## 部署 Dify 社区版 on EKS

### 1. 配置 cdk.json
```json
    "dbPassword": "Your.dbPassword.0910",
    "opensearchPassword": "Your.aosPassword.0910",
    "S3AccessKey": "Your.S3.AccessKey",
    "S3SecretKey": "Your.S3.SecretKey",
```
>这里需注意 OpenSearch 密码规则: The master user password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.

### 2. 本地拉取 ALBC Helm Chart (中国区限制)
```bash
helm pull aws-load-balancer-controller --repo https://aws.github.io/eks-charts --version 1.8.3
tar -xzf aws-load-balancer-controller-1.8.3.tgz -C src/lib/EKS
rm aws-load-balancer-controller-1.8.3.tgz
```

### 3. 本地拉取 Dify Helm Chart (中国区限制)
```bash
helm pull dify --repo https://douban.github.io/charts --version 0.5.0
tar -xzf dify-0.5.0.tgz -C src/lib/Dify
rm dify-0.5.0.tgz
```

### 4. 集成并通过 CDK 部署模版
```bash
cdk synth
```

### 5. 部署 CDK
```bash
cdk deploy --all --concurrency 5 --require-approval never
```
>使用并行部署会缩短整体部署时间，整个部署过程大概 20 分钟左右


### 6. 部署后配置 Dify Helm Chart 环境变量
编辑 lib/Dify 目录下 dify-helm-stack.ts
如果您没有自己的域名，请配置文件中的两个 host 变量为 CDK 创建的 ALB 的 DNS name，如：
```ts
global: {
    //Specify your host on ALB DNS name
    host: '{your_alb_cname}',
```
```ts
ingress: {
/// other code
    hosts: [{
    //Specify your host on ALB DNS name
        host: '{your_alb_cname}',
```

如果您有自己的域名，请配置自己的域名，并打开 tls，将自己的证书 ARN配置到 `alb.ingress.kubernetes.io/certificate-arn`

修改完成后，再次部署以更新 Dify Helm Chart Values
```bash
cdk deploy --all --concurrency 5 --require-approval never
```

### 7. 初始化 dify 数据库
```bash
kubectl exec -it $(kubectl get pods -n dify -l app.kubernetes.io/component=api -o jsonpath='{.items[0].metadata.name}') -n dify -- flask db upgrade
```

### 8. 访问 Dify
```bash
kubectl get ingress
```
访问 http://{your_alb_cname} 访问 dify，并进行管理员注册

**Now Happy dify with AWS!**

## 附录
### 1. 关于升级
dify 社区版非常活跃，升级时需要重新拉取 Helm Chart，并更新 `dify-helm-stack.ts` 中的变量。

### 2. 关于 Dify Docker 镜像
官方建议 ECR 地址: https://github.com/nwcdlabs/container-mirror

已有镜像地址:
https://github.com/nwcdlabs/container-mirror/blob/master/mirror/mirrored-images.txt

### 3. 通过自建 ECR 维护 Dify Docker 镜像
```bash
aws ecr get-login-password | docker login --username AWS --password-stdin {your_account_id}.dkr.ecr.cn-northwest-1.amazonaws.com.cn

docker pull langgenius/dify-api:0.8.2

docker pull langgenius/dify-web:0.8.2

docker pull langgenius/dify-sandbox:latest

docker tag docker.io/langgenius/dify-api:0.8.2 {your_account_id}.dkr.ecr.cn-northwest-1.amazonaws.com.cn/langgenius/dify-api:0.8.2

docker tag docker.io/langgenius/dify-web:0.8.2 {your_account_id}.dkr.ecr.cn-northwest-1.amazonaws.com.cn/langgenius/dify-web:0.8.2

docker tag docker.io/langgenius/dify-sandbox:latest {your_account_id}.dkr.ecr.cn-northwest-1.amazonaws.com.cn/langgenius/dify-sandbox:latest

docker push {your_account_id}.dkr.ecr.cn-northwest-1.amazonaws.com.cn/langgenius/dify-api:0.8.2

docker push {your_account_id}.dkr.ecr.cn-northwest-1.amazonaws.com.cn/langgenius/dify-web:0.8.2

docker push {your_account_id}.dkr.ecr.cn-northwest-1.amazonaws.com.cn/langgenius/dify-sandbox:latest
