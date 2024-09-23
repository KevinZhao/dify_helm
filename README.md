# dify on AWS

This helm chart is based on docker-compose provided by dify

this helm is distributed with `Apache License 2.0`

![Deployment Architecture](https://github.com/KevinZhao/dify_helm/blob/main/doc/Architecture.png?raw=true)

## Install from CDK

0.Prepare the CDK enviroment
```bash
sudo dnf install nodejs git -y
sudo npm install -g aws-cdk 
sudo npm install -g typescript ts-node
```

配置 AWS CLI
```bash
aws configure
```

下载 cdk 代码
```bash
git clone https://github.com/KevinZhao/dify_helm.git
cd dify_helm/dify-cdk/
npm install
```

1.部署 dify社区版

配置 cdk.json
```json
    "dbPassword": "Your.dbPassword.0910",
    "opensearchPassword": "Your.aosPassword.0910",
    "S3AccessKey": "Your.S3.AccessKey",
    "S3SecretKey": "Your.S3.SecretKey",
```

2.配置cdk环境，只需运行一次
```bash
cdk synth
cdk bootstrap
```

3.部署 CDK
```bash
cdk deploy --all --concurrency 5 --require-approval never
```
请一定使用并行部署，整个部署过程大概 20 分钟左右，如不使用并行，会花费额外时间。

4.部署后配置 helm 环境变量
编辑 lib 目录下 dify-helm-stack.ts
如果您没有自己的域名，请配置文件中的两个 host 变量为 CDK 创建的 ALB 的 DNSname，如：
```ts
    const difyHelm = new eks.HelmChart(this, 'DifyHelmChart', {
      cluster: props.cluster,
      chart: 'dify',
      repository: 'https://douban.github.io/charts/',
      release: 'dify',
      namespace: 'default',
      values: {
        global: {
          //Specify your host on ALB DNS name
          host: 'k8s-default-dify-324ef51b8a-687325639.us-east-1.elb.amazonaws.com',
```
```ts
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
            host: 'k8s-default-dify-324ef51b8a-687325639.us-east-1.elb.amazonaws.com',
```

如果您有自己的域名，请配置自己的域名，并打开 tls，将自己的证书 ARN配置到'alb.ingress.kubernetes.io/certificate-arn'。


其他环境变量的注入，请参考 https://docs.dify.ai/v/zh-hans/getting-started/install-self-hosted/environments

5.dify 数据库初始化
请找到一台可以连接 EKS 的终端，并运行
```bash
kubectl exec -it $(kubectl get pods -n dify -l app.kubernetes.io/component=api -o jsonpath='{.items[0].metadata.name}') -n dify -- flask db upgrade
```

执行后，可以使用 http://ALBDNSName的方式访问 dify，并进行进行管理员注册。

Finally
Happy dify with AWS

关于升级：
dify 社区版非常活跃，需要升级请更新 dify-helm-stack.ts 中的 tag 变量。
并重新运行 cdk deploy，和数据库初始化。
