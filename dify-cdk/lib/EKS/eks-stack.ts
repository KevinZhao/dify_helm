import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as lambdaLayerKubectl from '@aws-cdk/lambda-layer-kubectl-v30'; // 引入 kubectl v30
import { Construct } from 'constructs';

interface EKSClusterStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  subnets: ec2.SelectedSubnets;
  //rdsSecretArn: string; // 使用 RDSStack 的输出
}

export class EKSClusterStack extends cdk.Stack {
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
      clusterName: this.node.tryGetContext('EKSClusterName'),
      vpc: props.vpc,
      vpcSubnets: [props.subnets],
      securityGroup: eksControlPlaneSecurityGroup,
      role: eksClusterRole,
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
      kubectlLayer: new lambdaLayerKubectl.KubectlV30Layer(this, 'KubectlLayer'), // kubectl Layer
    });

    //This is for debug usage
    const adminUser = iam.User.fromUserName(this, 'AdminUser', 'admin');

    // 将 IAM 用户添加到 system:masters 组
    this.cluster.awsAuth.addUserMapping(adminUser, {
      groups: ['system:masters'],
      username: 'admin',
    });

    // 从 Secrets Manager 获取 RDS 密码
    /*const rdsSecret = secretsmanager.Secret.fromSecretCompleteArn(this, 'RDSSecret', props.rdsSecretArn);
    const rdsPassword = rdsSecret.secretValueFromJson('password').unsafeUnwrap();

    // 将 RDS 密码存储到 Kubernetes Secret 中
    new eks.KubernetesManifest(this, 'RdsSecret', {
      cluster: this.cluster,
      manifest: [
        {
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: {
            name: 'rds-db-secret',
            namespace: 'default',
          },
          type: 'Opaque',
          data: {
            rds_password: Buffer.from(rdsPassword).toString('base64'),
          },
        },
      ],
    });*/

    /*
    // 读取 Kubernetes Secret 中的密码
    const secretValue = new eks.KubernetesObjectValue(this, 'ReadRdsSecret', {
      cluster: this.cluster,
      objectType: 'secret',
      objectName: 'rds-db-secret', // Secret 的名称
      objectNamespace: 'default', // 命名空间
      jsonPath: '.data.rds_password', // JSON 路径读取密码字段
    });

    // 解码 Base64 密码并输出到 CloudFormation 控制台
    new cdk.CfnOutput(this, 'DecodedRdsPassword', {
      value: Buffer.from(secretValue.value, 'base64').toString('utf-8'),
      description: 'The decoded RDS password from the EKS Kubernetes Secret',
    });*/


    /*
    // 创建节点组 IAM 角色
    const nodeGroupRole = new iam.Role(this, 'NodeGroupRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
      ],
    });

    // 添加节点组
    this.cluster.addNodegroupCapacity('NodeGroup', {
      instanceTypes: [new ec2.InstanceType(this.node.tryGetContext('NodeInstanceType') || 't3.medium')],
      minSize: this.node.tryGetContext('NodeGroupMinSize') || 2,
      desiredSize: this.node.tryGetContext('NodeGroupDesiredSize') || 2,
      maxSize: this.node.tryGetContext('NodeGroupMaxSize') || 4,
      nodeRole: nodeGroupRole,
    });*/

    // 输出 EKS 集群相关信息
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      exportName: 'EKSClusterName',
    });
  }
}