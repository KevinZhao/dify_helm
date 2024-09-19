import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

interface S3StackProps extends cdk.StackProps {
  prefix: string;
}

export class S3Stack extends cdk.Stack {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: S3StackProps) {
    super(scope, id, props);

    // S3 存储桶
    this.bucket = new s3.Bucket(this, 'S3Bucket', {
      bucketName: `${props.prefix}-${this.account}-${this.region}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // RETAIN for Production
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // 使用 addToResourcePolicy 添加策略
    this.bucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
      resources: [this.bucket.arnForObjects('*')],
      principals: [new iam.AccountRootPrincipal()],
    }));

    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'S3 Bucket Name',
      exportName: 'S3BucketName',
    });
  }
}

