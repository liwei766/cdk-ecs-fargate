#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { DevStack } from '../lib/dev-stack';

const app = new cdk.App();
new DevStack(app, 'DevStack');
