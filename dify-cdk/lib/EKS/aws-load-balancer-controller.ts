import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';

interface ALBCDeploymentStackProps extends cdk.NestedStackProps {
  cluster: eks.Cluster;
}

export class ALBCDeploymentStack extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: ALBCDeploymentStackProps) {
    super(scope, id, props);

    // Read local IAM policy file
    const policyFilePath = path.join(__dirname, 'iam_policy.json');
    const policyJson = JSON.parse(fs.readFileSync(policyFilePath, 'utf-8'));

    // Create ALB Load Balancer Controller ServiceAccount
    const albServiceAccount = props.cluster.addServiceAccount('ALBServiceAccount', {
      name: 'aws-load-balancer-controller',
      namespace: 'kube-system',
    });

    // Create IAM Policy
    const albPolicy = new iam.Policy(this, 'ALBControllerPolicy');

    // Apply the downloaded IAM policy to the Policy object
    this.applyPolicyFromJson(albPolicy, policyJson);

    // Attach the policy to the ServiceAccount's IAM Role
    albServiceAccount.role.attachInlinePolicy(albPolicy);

    // Deploy AWS Load Balancer Controller via Helm chart
    props.cluster.addHelmChart('ALBController', {
      chart: 'aws-load-balancer-controller',
      release: 'aws-load-balancer-controller',
      repository: 'https://aws.github.io/eks-charts',
      namespace: 'kube-system',
      values: {
        clusterName: props.cluster.clusterName,
        serviceAccount: {
          create: false, // Use the manually created ServiceAccount
          name: albServiceAccount.serviceAccountName,
        },
      },
    });
  }

  // Apply policy from JSON file to the Policy object
  private applyPolicyFromJson(policy: iam.Policy, policyJson: any) {
    policyJson.Statement.forEach((statement: any) => {
      policy.addStatements(new iam.PolicyStatement({
        actions: statement.Action,
        resources: statement.Resource || ['*'],
      }));
    });
  }
}