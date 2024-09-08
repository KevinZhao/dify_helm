import {StackProps, CfnParameter, CfnOutput} from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

import { Construct } from 'constructs';

// Local definition
import {VPCStack} from './VPC/vpc-stack';
import {S3Stack} from './S3/s3-stack';
import {RDSStack} from './RDS/rds-stack';
import {RedisServerlessStack} from './redis/redis-stack';
import {EKSClusterStack} from './EKS/eks-stack';
import {HelmDeploymentStack} from './EKS/dify-stack';
import {ALBCDeploymentStack} from './EKS/aws-load-balancer-controller';

/*
interface MainStackProps extends StackProps {
  deployRds?: boolean;
}*/

//const app = new cdk.App();

export class MyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 0. VPC Stack
    const _VpcStack = new VPCStack(this, 'vpc-Stack', {
      /*env: props.env,*/
    });


    // 1. S3 Stack
    const _S3Stack = new S3Stack(this, 's3-Stack', {
      /*env: props.env,*/
    });

    // 2. RDS Stack
    const privateSubnets = _VpcStack.vpc.selectSubnets({subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS});

    const _RdsStack = new RDSStack(this, 'rds-Stack', {
        //env: props.env,
        subnets: privateSubnets,
        vpc: _VpcStack.vpc
    });

    const redisSubnets = _VpcStack.vpc.selectSubnets({subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS});

    const _RedisStack = new RedisServerlessStack(this, 'redis-Stack', {
        //env: props.env,
        subnets: privateSubnets,
        vpc: _VpcStack.vpc
    });

    // 3. EKS Stack
    const eksSubnets = _VpcStack.vpc.selectSubnets({subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS});
    const _eksClusterStack = new EKSClusterStack(this, 'eks-Stack', {
      //env: props.env,
      subnets: privateSubnets,
      vpc: _VpcStack.vpc
    });

    const albc = new ALBCDeploymentStack(this, 'albc-Stack', {
      cluster: _eksClusterStack.cluster,
    });

    /*
    new HelmDeploymentStack(this, 'HelmDeploymentStack', {
      cluster: _eksClusterStack.cluster, 
    });*/
  
  }
}

