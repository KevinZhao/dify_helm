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

    // S3 存储桶策略
    // 创建 S3 bucket policy
    const bucketPolicy = new s3.BucketPolicy(this, 'S3BucketPolicy', {
      bucket: this.bucket,
    });

    // 添加策略声明到 bucket policy 文档中
    bucketPolicy.document.addStatements(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        resources: [this.bucket.arnForObjects('*')], // 获取桶对象的 ARN
        principals: [new iam.AccountRootPrincipal()], // 使用账户根用户
      })
    );
  }
}

