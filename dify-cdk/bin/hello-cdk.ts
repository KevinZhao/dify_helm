#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DifyStack } from '../lib/dify-stack';

const app = new cdk.App();
new DifyStack(app, 'DifyStack');