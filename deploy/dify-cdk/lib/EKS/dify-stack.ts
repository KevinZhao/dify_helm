import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface HelmDeploymentStackProps extends cdk.StackProps {
  cluster: eks.Cluster;
}

export class HelmDeploymentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: HelmDeploymentStackProps) {
    super(scope, id, props);

    // ALB Load Balancer Controller ServiceAccount
    const albServiceAccount = props.cluster.addServiceAccount('ALBServiceAccount', {
      name: 'aws-load-balancer-controller',
      namespace: 'kube-system',
    });

    // Attach the IAM policies required by the ALB Controller
    albServiceAccount.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AWSLoadBalancerControllerIAMPolicy'));

    // 使用 Helm Chart 部署 ALB Load Balancer Controller
    props.cluster.addHelmChart('ALBController', {
      chart: 'aws-load-balancer-controller',
      release: 'aws-load-balancer-controller',
      repository: 'https://aws.github.io/eks-charts',
      namespace: 'kube-system',
      values: {
        clusterName: props.cluster.clusterName, // EKS 集群的名称
        serviceAccount: {
          create: false, // 使用我们手动创建的 ServiceAccount
          name: albServiceAccount.serviceAccountName,
        },
      },
    });
  }
}