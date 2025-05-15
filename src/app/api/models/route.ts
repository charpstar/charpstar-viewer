// src/app/api/models/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { clients, getClientConfig } from '@/config/clientConfig';
import https from 'https';

const REGION = process.env.BUNNY_REGION || '';
const BASE_HOSTNAME = 'storage.bunnycdn.com';
const HOSTNAME = REGION ? `${REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;
const STORAGE_ZONE_PATH = process.env.BUNNY_STORAGE_ZONE_NAME || '';
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY || ''; 

// Helper to extract the zone name from the environment variable
const getStorageZoneDetails = () => {
  const parts = STORAGE_ZONE_PATH.split('/');
  const zoneName = parts[0];
  return { zoneName };
};

// Helper to filter valid model filenames
// Exclude files with lowercase characters, spaces, underscores, or "ANIM" in the name
const isValidModelFilename = (filename: string): boolean => {
  console.log(`Checking filename: ${filename}`);
  
  // Check for lowercase characters
  if (/[a-z]/.test(filename)) {
    console.log(`- Rejected: contains lowercase characters`);
    return false;
  }
  
  // Check for spaces
  if (filename.includes(' ')) {
    console.log(`- Rejected: contains spaces`);
    return false;
  }
  
  // Check for underscores
  if (filename.includes('_')) {
    console.log(`- Rejected: contains underscores`);
    return false;
  }
  
  // Check for "ANIM" in the name
  if (filename.includes('ANIM')) {
    console.log(`- Rejected: contains "ANIM"`);
    return false;
  }
  
  // File passed all checks
  console.log(`- Accepted: passed all filters`);
  return true;
};

// Fetch files from BunnyCDN directory
const fetchFilesFromBunnyCDN = async (path: string): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const { zoneName } = getStorageZoneDetails();
    
    const options = {
      method: 'GET',
      host: HOSTNAME,
      path: `/${zoneName}/${path}/`,
      headers: {
        AccessKey: ACCESS_KEY,
        accept: 'application/json'
      },
    };
    
    console.log(`Fetching files from: ${options.host}${options.path}`);
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const files = JSON.parse(data);
            
            if (!Array.isArray(files)) {
              console.error('Unexpected response format from BunnyCDN:', files);
              return reject(new Error('Invalid response format from BunnyCDN'));
            }
            
            console.log(`Total files found: ${files.length}`);
            
            // First filter only .gltf files
            const gltfFiles = files.filter((file: any) => 
              file.IsDirectory === false && file.ObjectName.endsWith('.gltf')
            );
            
            console.log(`Total GLTF files found: ${gltfFiles.length}`);
            
            // Log all GLTF files for debugging
            gltfFiles.forEach((file: any) => {
              console.log(`GLTF file: ${file.ObjectName}`);
            });
            
            // Then apply our custom filename filter
            const validGltfFiles = gltfFiles
              .filter((file: any) => isValidModelFilename(file.ObjectName))
              .map((file: any) => file.ObjectName);
            
            console.log(`Valid GLTF files after filtering: ${validGltfFiles.length}`);
            
            // If no valid files found, let's try a more permissive filter for debugging
            if (validGltfFiles.length === 0 && gltfFiles.length > 0) {
              console.log('No files passed the filter. Returning all GLTF files for debugging.');
              resolve(gltfFiles.map((file: any) => file.ObjectName));
            } else {
              resolve(validGltfFiles);
            }
          } catch (error) {
            console.error('Failed to parse BunnyCDN response:', error);
            console.error('Response data:', data);
            reject(new Error(`Failed to parse BunnyCDN response: ${error}`));
          }
        } else {
          console.error(`BunnyCDN API returned status ${res.statusCode}:`, data);
          reject(new Error(`BunnyCDN API returned status ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('Error making request to BunnyCDN:', error);
      reject(error);
    });
    
    req.end();
  });
};

// Get client models from BunnyCDN
const getClientModels = async (clientName: string): Promise<string[]> => {
  try {
    const clientConfig = getClientConfig(clientName);
    const basePath = clientConfig.bunnyCdn.basePath;
    
    console.log(`Fetching models for client ${clientName} from path: ${basePath}`);
    
    // Fetch all files from the client's base path in BunnyCDN
    const models = await fetchFilesFromBunnyCDN(basePath);
    
    // Log the models for debugging
    console.log(`Returning ${models.length} models:`, models);
    
    return models;
  } catch (error) {
    console.error('Error fetching models from BunnyCDN:', error);
    // Return empty array instead of using fallback
    return [];
  }
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientName = searchParams.get('client');
    
    if (!clientName || !clients[clientName]) {
      return NextResponse.json(
        { error: 'Invalid or missing client parameter' },
        { status: 400 }
      );
    }
    
    const models = await getClientModels(clientName);
    
    // Log the response for debugging
    console.log(`API returning ${models.length} models for client ${clientName}`);
    
    // Return just the array of models to maintain compatibility with existing code
    return NextResponse.json(models);
  } catch (error) {
    console.error('Error fetching model list:', error);
    return NextResponse.json(
      { error: 'Failed to fetch models' },
      { status: 500 }
    );
  }
}