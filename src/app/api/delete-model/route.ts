import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { getDefaultClientName, getClientConfig } from '@/config/clientConfig';

const REGION = process.env.BUNNY_REGION || '';
const BASE_HOSTNAME = 'storage.bunnycdn.com';
const HOSTNAME = REGION ? `${REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;
const STORAGE_ZONE_PATH = process.env.BUNNY_STORAGE_ZONE_NAME || '';
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY || '';
const BUNNY_API_KEY = process.env.BUNNY_API_KEY || '';
const BUNNY_PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL || 'cdn.charpstar.net';
const DEFAULT_CLIENT = getDefaultClientName();

// Helper to extract the zone name and base path from the environment variable
const getStorageZoneDetails = () => {
  const parts = STORAGE_ZONE_PATH.split('/');
  const zoneName = parts[0];
  const basePath = parts.slice(1).join('/');
  return { zoneName, basePath };
};

export async function DELETE(request: NextRequest) {
  try {
    // Parse the JSON body
    const requestBody = await request.json();
    
    if (!requestBody || !requestBody.filename || !requestBody.client) {
      return NextResponse.json({ error: 'Missing required fields: filename and client' }, { status: 400 });
    }
    
    const filename = requestBody.filename;
    const clientName = requestBody.client;
    
    // Validate filename is a model file
    if (!filename.endsWith('.gltf') && !filename.endsWith('.glb')) {
      return NextResponse.json({ error: 'Invalid file type. Only .gltf and .glb files can be deleted.' }, { status: 400 });
    }
    
    // Get client-specific BunnyCDN configuration
    const clientConfig = getClientConfig(clientName);
    const { zoneName, basePath } = getStorageZoneDetails();
    
    // Construct the path for the file in BunnyCDN
    const filePath = `${clientConfig.bunnyCdn.basePath}/${filename}`;
    
    console.log(`Deleting model file: ${filePath}`);
    
    // Delete from BunnyCDN
    const deletePromise = new Promise((resolve, reject) => {
      const options = {
        method: 'DELETE',
        host: HOSTNAME,
        path: `/${zoneName}/${filePath}`,
        headers: {
          AccessKey: ACCESS_KEY,
        },
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          console.log(`Delete response status: ${res.statusCode}`);
          console.log(`Delete response data: ${data}`);
          
          if (res.statusCode === 200 || res.statusCode === 204) {
            resolve({ success: true });
          } else {
            reject(new Error(`Delete failed with status ${res.statusCode}: ${data}`));
          }
        });
      });
      
      req.on('error', (error) => {
        console.error(`Request error during delete: ${error.message}`);
        reject(error);
      });
      
      req.end();
    });
    
    try {
      await deletePromise;
      console.log('Delete completed successfully');
    } catch (deleteError: unknown) {
      console.error('Error during delete:', deleteError);
      
      // Handle the unknown error type properly
      let errorMessage = 'Unknown error';
      if (deleteError instanceof Error) {
        errorMessage = deleteError.message;
      } else if (typeof deleteError === 'string') {
        errorMessage = deleteError;
      }
      
      return NextResponse.json({ error: 'Failed to delete file: ' + errorMessage }, { status: 500 });
    }
    
    // Construct the CDN URL for cache purging
    const fileUrl = `https://${BUNNY_PULL_ZONE_URL}/${filePath}`;
    
    // Purge the cache for this file
    console.log(`Purging cache for deleted file: ${fileUrl}`);
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
        console.log('Cache purge successful for deleted file');
      }
    } catch (purgeError) {
      console.error('Error purging cache for deleted file:', purgeError);
      // Continue even if purge fails
    }
    
    console.log('Successfully completed delete process');
    return NextResponse.json({ 
      success: true, 
      message: `File ${filename} deleted successfully`
    });
  } catch (error: unknown) {
    console.error('Uncaught error in delete-model route:', error);
    
    // Handle the unknown error type properly
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    
    return NextResponse.json(
      { error: 'Failed to delete file: ' + errorMessage },
      { status: 500 }
    );
  }
}