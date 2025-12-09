/**
 * Setup CORS for R2 Bucket
 * Run with: node scripts/setup-r2-cors.js
 */

import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'audio-generations';
const R2_ENDPOINT = process.env.R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('❌ Missing R2 credentials in .env file');
  process.exit(1);
}

const r2Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const corsRules = [
  {
    AllowedOrigins: [
      'http://localhost:5174',
      'http://localhost:3000',
      'https://youtulabs.com',
      'https://*.youtulabs.com'
    ],
    AllowedMethods: ['GET', 'HEAD'],
    AllowedHeaders: ['*'],
    ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
    MaxAgeSeconds: 3600,
  },
];

async function setupCORS() {
  try {
    console.log(`[R2 CORS] Setting up CORS for bucket: ${R2_BUCKET_NAME}`);
    console.log(`[R2 CORS] Endpoint: ${R2_ENDPOINT}`);

    const command = new PutBucketCorsCommand({
      Bucket: R2_BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: corsRules,
      },
    });

    await r2Client.send(command);
    console.log('✅ CORS configuration applied successfully!');

    // Verify the configuration
    console.log('\n[R2 CORS] Verifying CORS configuration...');
    const getCommand = new GetBucketCorsCommand({
      Bucket: R2_BUCKET_NAME,
    });

    const result = await r2Client.send(getCommand);
    console.log('✅ Current CORS configuration:');
    console.log(JSON.stringify(result.CORSRules, null, 2));
  } catch (error) {
    console.error('❌ Failed to set CORS configuration:', error);
    process.exit(1);
  }
}

setupCORS();
