import * as cdk from 'aws-cdk-lib';
//import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class S3Stack extends cdk.Stack {
  public readonly bucket: s3.Bucket; // 公共属性

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 存储桶
    this.bucket = new s3.Bucket(this, 'S3Bucket', {
      bucketName: `dify-${this.account}-${this.region}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // 保留 S3 Bucket，即使堆栈删除
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    /*
    // S3 存储桶策略
    const bucketPolicy = new s3.BucketPolicy(this, 'S3BucketPolicy', { bucket });
    bucketPolicy.document.addStatements(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        resources: [bucket.arnForObjects('*')],
        principals: [new iam.AccountRootPrincipal()],
      })
    );*/

  }
}

