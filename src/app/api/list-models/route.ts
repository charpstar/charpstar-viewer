import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { getDefaultClientName, getClientConfig } from '@/config/clientConfig';

const REGION = process.env.BUNNY_REGION || '';
const BASE_HOSTNAME = 'storage.bunnycdn.com';
const HOSTNAME = REGION ? `${REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;
const STORAGE_ZONE_PATH = process.env.BUNNY_STORAGE_ZONE_NAME || '';
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY || '';
const DEFAULT_CLIENT = getDefaultClientName();

// Helper to extract the zone name and base path from the environment variable
const getStorageZoneDetails = () => {
  const parts = STORAGE_ZONE_PATH.split('/');
  const zoneName = parts[0];
  const basePath = parts.slice(1).join('/');
  return { zoneName, basePath };
};

export async function GET(request: NextRequest) {
  try {
    // Get client name from query params or use default
    const { searchParams } = new URL(request.url);
    const clientName = searchParams.get('client') || DEFAULT_CLIENT;
    
    // Get client-specific BunnyCDN configuration
    const clientConfig = getClientConfig(clientName);
    const { zoneName, basePath } = getStorageZoneDetails();
    
    // Construct the path to the client's base folder
    const clientBasePath = `${clientConfig.bunnyCdn.basePath}/`;
    
    console.log(`Listing models for client: ${clientName}, path: ${clientBasePath}`);
    
    // List files in the client's base directory
    const listPromise = new Promise<{filename: string, size: number, lastModified: string}[]>((resolve, reject) => {
      const options = {
        method: 'GET',
        host: HOSTNAME,
        path: `/${zoneName}/${clientBasePath}`,
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
          if (res.statusCode === 200) {
            try {
              const fileList = JSON.parse(data);
              // Extract GLTF and GLB files from the response
              const modelFiles = fileList
                .filter((file: any) => {
                  const filename = file.ObjectName.split('/').pop();
                  return filename && (filename.endsWith('.gltf') || filename.endsWith('.glb'));
                })
                .map((file: any) => ({
                  filename: file.ObjectName.split('/').pop(),
                  size: file.Length,
                  lastModified: file.LastChanged
                }));
              
              resolve(modelFiles);
            } catch (parseError) {
              console.error('Error parsing file list:', parseError);
              resolve([]);
            }
          } else {
            console.warn(`List files returned status ${res.statusCode}: ${data}`);
            resolve([]); // Return empty array instead of rejecting
          }
        });
      });
      
      req.on('error', (error) => {
        console.error(`Error listing files: ${error.message}`);
        resolve([]); // Return empty array instead of rejecting
      });
      
      req.end();
    });
    
    const modelFiles = await listPromise;
    
    return NextResponse.json({ 
      success: true, 
      models: modelFiles,
      clientBasePath: clientBasePath
    });
  } catch (error: unknown) {
    console.error('Error in list-models route:', error);
    
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    
    return NextResponse.json(
      { error: 'Failed to list models: ' + errorMessage },
      { status: 500 }
    );
  }
}