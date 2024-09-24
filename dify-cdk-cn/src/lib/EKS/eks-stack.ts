import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambdaLayerKubectl from '@aws-cdk/lambda-layer-kubectl-v30'; // 引入 kubectl v30
import { Construct } from 'constructs'; 
import * as fs from 'fs';
import * as path from 'path';
import * as s3_assets from 'aws-cdk-lib/aws-s3-assets';

interface EKSClusterStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  subnets: ec2.SelectedSubnets;
  eksClusterName: string;
}

export class EKSStack extends cdk.Stack {
  public readonly cluster: eks.Cluster;
  public readonly helmDeployRole: iam.Role;

  constructor(scope: Construct, id: string, props: EKSClusterStackProps) {
    super(scope, id, props);

    // EKS 控制平面安全组
    const eksControlPlaneSecurityGroup = new ec2.SecurityGroup(this, 'EKSControlPlaneSG', {
      vpc: props.vpc,
      description: 'Cluster communication with worker nodes',
      allowAllOutbound: true,
    });

    eksControlPlaneSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.allTraffic(),
      'Allow all traffic from within the VPC'
    );

    // EKS 集群角色
    const eksClusterRole = new iam.Role(this, 'EKSClusterRole', {
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy')],
    });

    // 创建 EKS 集群
    this.cluster = new eks.Cluster(this, 'EKSCluster', {
      version: eks.KubernetesVersion.of(this.node.tryGetContext('EKSClusterVersion') || '1.30'),
      clusterName: props.eksClusterName,
      vpc: props.vpc,
      vpcSubnets: [props.subnets],
      securityGroup: eksControlPlaneSecurityGroup,
      role: eksClusterRole,
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
      defaultCapacity: 0, // 禁用默认节点组
      kubectlLayer: new lambdaLayerKubectl.KubectlV30Layer(this, 'KubectlLayer'),
      authenticationMode: eks.AuthenticationMode.API_AND_CONFIG_MAP,
    });

    // //This is for debug usage
    // const adminUser = iam.User.fromUserName(this, 'AdminUser', 'chynwa_cn_dev');

    // // 将 IAM 用户添加到 system:masters 组
    // this.cluster.awsAuth.addUserMapping(adminUser, {
    //   groups: ['system:masters'],
    //   username: 'chynwa_cn_dev',
    // });

    // 创建节点组 IAM 角色
    const nodeGroupRole = new iam.Role(this, 'NodeGroupRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com.cn'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
      ],
    });

    const invokeSagemakerPolicy = new iam.PolicyStatement({
      actions: ['sagemaker:InvokeEndpoint'],
      resources: ['*'],
    });

    nodeGroupRole.addToPolicy(invokeSagemakerPolicy);

    this.cluster.addNodegroupCapacity('NodeGroup', {
      instanceTypes: [new ec2.InstanceType(this.node.tryGetContext('NodeInstanceType') || 'm5a.large')], // change to different architecture accordingly
      minSize: this.node.tryGetContext('NodeGroupMinSize') || 2,
      desiredSize: this.node.tryGetContext('NodeGroupDesiredSize') || 2,
      maxSize: this.node.tryGetContext('NodeGroupMaxSize') || 4,
      nodeRole: nodeGroupRole,
    });

    // 读取本地 IAM 策略文件
    const policyFilePath = path.join(__dirname, 'iam-policy.json');
    const policyJson = JSON.parse(fs.readFileSync(policyFilePath, 'utf-8'));

    // 创建 ALB Load Balancer Controller ServiceAccount
    const albServiceAccount = this.cluster.addServiceAccount('ALBServiceAccount', {
      name: 'aws-load-balancer-controller',
      namespace: 'kube-system',
    });

    // 创建 IAM Policy
    const albPolicy = new iam.Policy(this, 'ALBControllerPolicy');

    // 将下载的 IAM 策略应用到 Policy 对象
    this.applyPolicyFromJson(albPolicy, policyJson);

    // 将该策略附加到 ServiceAccount 的 IAM Role
    albServiceAccount.role.attachInlinePolicy(albPolicy);

    // Create the chart asset
    const chart_asset = new s3_assets.Asset(this, "ALBCChartAsset", {
      path: path.join(__dirname, 'aws-load-balancer-controller/')
    });

    // Create a new IAM role for Helm chart deployment
    this.helmDeployRole = new iam.Role(this, 'HelmDeployRole', {
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com'),
      roleName: 'EKSHelmDeployRole'
    });

    // Add a condition to the trust relationship
    this.helmDeployRole.assumeRolePolicy?.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('eks.amazonaws.com')],
        actions: ['sts:AssumeRole'],
        conditions: {
          ArnLike: {
            'aws:SourceArn': this.cluster.clusterArn
          }
        }
      })
    );

    // Grant S3 permissions to the new role
    chart_asset.grantRead(this.helmDeployRole);
    this.cluster.awsAuth.addRoleMapping(this.helmDeployRole, { groups: ['system:masters'] });

    // Add additional S3 permissions if needed
    this.helmDeployRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
      resources: [`${chart_asset.bucket.bucketArn}/`, `${chart_asset.bucket.bucketArn}/*`],
    }));

    // Create a CfnOutput for the role
    const roleOutput = new cdk.CfnOutput(this, 'HelmDeployRoleArn', {
      value: this.helmDeployRole.roleArn,
      description: 'ARN of the Helm Deploy Role',
    });

    // Deploy the AWS Load Balancer Controller using Helm Chart
    const albController = this.cluster.addHelmChart('ALBController', {
      release: 'aws-load-balancer-controller',
      chartAsset: chart_asset,
      namespace: 'kube-system',
      values: {
        clusterName: this.cluster.clusterName,
        serviceAccount: {
          create: false,
          name: albServiceAccount.serviceAccountName,
        },
        vpcId: this.cluster.vpc.vpcId,
      },
    });

    albController.node.addDependency(roleOutput);
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