// Adjusted src/app/api/upload/route.ts for your environment structure
import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import fetch from 'node-fetch';

const REGION = process.env.BUNNY_REGION || '';
const BASE_HOSTNAME = 'storage.bunnycdn.com';
const HOSTNAME = REGION ? `${REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;
const STORAGE_ZONE_PATH = process.env.BUNNY_STORAGE_ZONE_NAME || '';
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY;
const BUNNY_API_KEY = process.env.BUNNY_API_KEY;
const BUNNY_PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL || 'cdn.charpstar.net';

// Helper to extract the zone name and base path from the environment variable
const getStorageZoneDetails = () => {
  const parts = STORAGE_ZONE_PATH.split('/');
  const zoneName = parts[0];
  const basePath = parts.slice(1).join('/');
  return { zoneName, basePath };
};

export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json();
    
    if (!requestBody || !requestBody.data || !requestBody.filename) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }
    
    // Extract just the materials data
    const materialsData = requestBody.data;
    const filename = requestBody.filename;
    
    // Convert materials data to string and buffer
    const jsonString = JSON.stringify(materialsData, null, 2);
    const buffer = Buffer.from(jsonString);
    
    // Get storage zone details
    const { zoneName, basePath } = getStorageZoneDetails();
    
    // Construct the path for the file
    // For materials.json, we want it directly in the folder: Client-Editor/Artwood/materials.json
    const filePath = `${basePath}Sweef/${filename}`;
    
    // 1. Upload the file
    const uploadPromise = new Promise((resolve, reject) => {
      const options = {
        method: 'PUT',
        host: HOSTNAME,
        path: `/${zoneName}/${filePath}`,
        headers: {
          AccessKey: ACCESS_KEY,
          'Content-Type': 'application/json',
          'Content-Length': buffer.length,
        },
      };
      
      console.log(`Uploading to: ${options.host}${options.path}`);
      
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            resolve({ success: true });
          } else {
            reject(new Error(`Upload failed with status ${res.statusCode}: ${data}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.write(buffer);
      req.end();
    });
    
    await uploadPromise;
    
    // 2. Purge the cache for this file
    // Construct full URL for the CDN
    const fileUrl = `https://${BUNNY_PULL_ZONE_URL}/${filePath}`;
    console.log(`Purging cache for: ${fileUrl}`);
    
      try {
      const purgeResponse = await fetch('https://api.bunny.net/purge?async=false', {
        method: 'POST',
        headers: {
          'AccessKey': BUNNY_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ urls: [fileUrl] })
      });
      
      if (!purgeResponse.ok) {
        const errorText = await purgeResponse.text();
        console.warn(`Cache purge warning: ${purgeResponse.status} - ${errorText}`);
      } else {
        // Check if there's a response body before trying to parse it
        const contentType = purgeResponse.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const responseText = await purgeResponse.text();
          if (responseText.trim()) {
            const purgeResult = JSON.parse(responseText);
            console.log('Cache purge result:', purgeResult);
          } else {
            console.log('Cache purge successful (empty response)');
          }
        } else {
          console.log('Cache purge successful');
        }
      }
    } catch (purgeError) {
      console.error('Error purging cache:', purgeError);
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'File uploaded and cache purged',
      fileUrl: fileUrl
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}