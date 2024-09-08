#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MyStack } from '../lib/main-stack';

const app = new cdk.App();
new MyStack(app, 'MyStack');