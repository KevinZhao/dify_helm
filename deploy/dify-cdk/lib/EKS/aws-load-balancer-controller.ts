import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface ALBCDeploymentStackProps extends cdk.StackProps {
  cluster: eks.Cluster;
}

export class ALBCDeploymentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ALBCDeploymentStackProps) {
    super(scope, id, props);

    // Create ALB Load Balancer Controller ServiceAccount
    const albServiceAccount = props.cluster.addServiceAccount('ALBServiceAccount', {
      name: 'aws-load-balancer-controller',
      namespace: 'kube-system',
    });

    // Define the necessary permissions for ALB Load Balancer Controller
    const albPolicyDocument = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "acm:DescribeCertificate",
            "acm:ListCertificates",
            "acm:GetCertificate",
            // Add all other required actions here
          ],
          resources: ["*"],
        }),
      ],
    });

    // Create the inline policy and attach it to the role
    const albPolicy = new iam.Policy(this, 'ALBControllerPolicy', {
      document: albPolicyDocument,
    });

    albServiceAccount.role.attachInlinePolicy(albPolicy);

    // Use Helm Chart to deploy the ALB Load Balancer Controller
    props.cluster.addHelmChart('ALBController', {
      chart: 'aws-load-balancer-controller',
      release: 'aws-load-balancer-controller',
      repository: 'https://aws.github.io/eks-charts',
      namespace: 'kube-system',
      values: {
        clusterName: props.cluster.clusterName,
        serviceAccount: {
          create: false, // Use manually created ServiceAccount
          name: albServiceAccount.serviceAccountName,
        },
      },
    });
  }
}