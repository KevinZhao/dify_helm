import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import {ALBCDeploymentStack} from './aws-load-balancer-controller';
import * as lambdaLayerKubectl from '@aws-cdk/lambda-layer-kubectl-v30'; // 引入 kubectl v30
import { Construct } from 'constructs';

interface EKSClusterStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  subnets: ec2.SelectedSubnets;
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
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy')],
    });

    // 创建 EKS 集群
    this.cluster = new eks.Cluster(this, 'EKSCluster', {
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

    // 创建节点组 IAM 角色
    const nodeGroupRole = new iam.Role(this, 'NodeGroupRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
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

    // 获取当前的 AWS 区域
    const currentRegion = cdk.Stack.of(this).region;

    // 根据区域选择 EKS 节点实例类型
    const nodeInstanceType = this.getNodeInstanceTypeForRegion(currentRegion);

    this.cluster.addNodegroupCapacity('NodeGroup', {
      instanceTypes: [new ec2.InstanceType(nodeInstanceType)],
      minSize: this.node.tryGetContext('NodeGroupMinSize') || 2,
      desiredSize: this.node.tryGetContext('NodeGroupDesiredSize') || 2,
      maxSize: this.node.tryGetContext('NodeGroupMaxSize') || 4,
      nodeRole: nodeGroupRole,
    });

    // Deploy ALBC if it doesn't exist
    const _ALBC = new ALBCDeploymentStack(this, 'ALBCDeploymentStack', {
      cluster: this.cluster,})

    // 输出 EKS 集群相关信息
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      exportName: 'EKSClusterName',
    });
  }

  // 根据 region 返回不同的实例类型
  private getNodeInstanceTypeForRegion(region: string): string {
    const regionSpecificNodeTypes: { [key: string]: string } = {
      'us-east-1': 'm7g.large',
      'us-east-2': 'm7g.large',
      'us-west-1': 'm7g.large',
      'us-west-2': 'm7g.large',
      'ap-southeast-1': 'm7g.large',
      'ap-northeast-1': 'm7g.large',
      'eu-central-1': 'm7g.large',
      'eu-west-1': 'm7g.large',
      'eu-west-2': 'm7g.large',
      'eu-west-3': 'm7g.large',
      'eu-north-1': 'm7g.large',
      'ap-southeast-2': 'm7g.large',
      'ap-northeast-2': 'm7g.large',
    };

    // 默认机型
    const defaultNodeType = 'm6i.large';

    return regionSpecificNodeTypes[region] || defaultNodeType;
  }
}
