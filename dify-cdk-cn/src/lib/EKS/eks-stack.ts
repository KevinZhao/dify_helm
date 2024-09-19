import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ALBCDeploymentStack } from './aws-load-balancer-controller';
import * as lambdaLayerKubectl from '@aws-cdk/lambda-layer-kubectl-v30'; // 引入 kubectl v30
import { Construct } from 'constructs';

interface EKSClusterStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  subnets: ec2.SelectedSubnets;
  eksClusterName: string;
}

export class EKSStack extends cdk.Stack {
  public readonly cluster: eks.Cluster;

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
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com.cn'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy')],
    });

    // 创建 EKS 集群
    this.cluster = new eks.Cluster(this, props.eksClusterName, {
      version: eks.KubernetesVersion.of(this.node.tryGetContext('EKSClusterVersion') || '1.30'),
      clusterName: 'dify-eks',
      vpc: props.vpc,
      vpcSubnets: [props.subnets],
      securityGroup: eksControlPlaneSecurityGroup,
      role: eksClusterRole,
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
      defaultCapacity: 0, // 禁用默认节点组
      kubectlLayer: new lambdaLayerKubectl.KubectlV30Layer(this, 'KubectlLayer'),
      authenticationMode: eks.AuthenticationMode.API_AND_CONFIG_MAP,
    });

    //This is for debug usage
    const adminUser = iam.User.fromUserName(this, 'AdminUser', 'admin');

    // 将 IAM 用户添加到 system:masters 组
    this.cluster.awsAuth.addUserMapping(adminUser, {
      groups: ['system:masters'],
      username: 'admin',
    });

    // Deploy ALBC if it doesn't exist
    const _ALBC = new ALBCDeploymentStack(this, 'ALBCDeploymentStack', {
      cluster: this.cluster,
    })

    // 创建节点组 IAM 角色
    const nodeGroupRole = new iam.Role(this, 'NodeGroupRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com.cn'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
      ],
    });

    this.cluster.addNodegroupCapacity('NodeGroup', {
      instanceTypes: [new ec2.InstanceType(this.node.tryGetContext('NodeInstanceType') || 'm6g.large')],
      minSize: this.node.tryGetContext('NodeGroupMinSize') || 2,
      desiredSize: this.node.tryGetContext('NodeGroupDesiredSize') || 2,
      maxSize: this.node.tryGetContext('NodeGroupMaxSize') || 4,
      nodeRole: nodeGroupRole,
    });

    // 输出 EKS 集群相关信息
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      exportName: 'EKSClusterName',
    });
  }
}