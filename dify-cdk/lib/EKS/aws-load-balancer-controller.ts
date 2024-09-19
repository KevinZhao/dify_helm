import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';

interface ALBCDeploymentStackProps extends cdk.StackProps {
  cluster: eks.Cluster;
}

export class ALBCDeploymentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ALBCDeploymentStackProps) {
    super(scope, id, props);

    // 读取本地 IAM 策略文件
    const policyFilePath = path.join(__dirname, 'iam_policy.json');
    const policyJson = JSON.parse(fs.readFileSync(policyFilePath, 'utf-8'));

    // 创建 ALB Load Balancer Controller ServiceAccount
    const albServiceAccount = props.cluster.addServiceAccount('ALBServiceAccount', {
      name: 'aws-load-balancer-controller',
      namespace: 'kube-system',
    });

    // 创建 IAM Policy
    const albPolicy = new iam.Policy(this, 'ALBControllerPolicy');

    // 将下载的 IAM 策略应用到 Policy 对象
    this.applyPolicyFromJson(albPolicy, policyJson);

    // 将该策略附加到 ServiceAccount 的 IAM Role
    albServiceAccount.role.attachInlinePolicy(albPolicy);

    // 使用 Helm Chart 部署 AWS Load Balancer Controller
    props.cluster.addHelmChart('ALBController', {
      chart: 'aws-load-balancer-controller',
      release: 'aws-load-balancer-controller',
      repository: 'https://aws.github.io/eks-charts',
      namespace: 'kube-system',
      values: {
        clusterName: props.cluster.clusterName,
        serviceAccount: {
          create: false, // 使用手动创建的 ServiceAccount
          name: albServiceAccount.serviceAccountName,
        },
      },
    });
  }

  // 从 JSON 文件中应用策略到 Policy 对象
  private applyPolicyFromJson(policy: iam.Policy, policyJson: any) {
    // 遍历策略中的权限并添加到 IAM Policy
    policyJson.Statement.forEach((statement: any) => {
      policy.addStatements(new iam.PolicyStatement({
        actions: statement.Action,
        resources: statement.Resource || ['*'],  // 处理资源字段
      }));
    });
  }
}