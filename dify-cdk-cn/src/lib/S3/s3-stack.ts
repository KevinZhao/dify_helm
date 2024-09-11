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
      removalPolicy: cdk.RemovalPolicy.DESTROY, // RETAIN for Production
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });
  }
}

