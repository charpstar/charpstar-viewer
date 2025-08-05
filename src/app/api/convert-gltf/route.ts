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

// Helper to upload a file to BunnyCDN
const uploadToBunny = async (
  filePath: string, 
  content: string, 
  contentType: string = 'application/json'
): Promise<void> => {
  const { zoneName } = getStorageZoneDetails();
  const buffer = Buffer.from(content);

  return new Promise((resolve, reject) => {
    const options = {
      method: 'PUT',
      host: HOSTNAME,
      path: `/${zoneName}/${filePath}`,
      headers: {
        AccessKey: ACCESS_KEY,
        'Content-Type': contentType,
        'Content-Length': buffer.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve();
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
};

// Helper to purge cache for a file
const purgeCache = async (fileUrl: string): Promise<void> => {
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
      console.warn(`Cache purge warning: ${purgeResponse.status}`);
    }
  } catch (error) {
    console.error('Error purging cache:', error);
  }
};

export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json();
    
    if (!requestBody || !requestBody.gltfContent || !requestBody.filename || !requestBody.client) {
      return NextResponse.json({ 
        error: 'Missing required fields: gltfContent, filename, and client' 
      }, { status: 400 });
    }
    
    const { gltfContent, filename, client } = requestBody;
    const clientConfig = getClientConfig(client);
    
    console.log(`Converting GLTF: ${filename} for client: ${client}`);
    
    // Parse the GLTF content
    let gltfData;
    try {
      gltfData = typeof gltfContent === 'string' ? JSON.parse(gltfContent) : gltfContent;
    } catch (parseError) {
      return NextResponse.json({ 
        error: 'Invalid GLTF JSON format' 
      }, { status: 400 });
    }

    // Fetch the protected extensions.json file
    let extensionsData = null;
    try {
      const extensionsUrl = `https://${BUNNY_PULL_ZONE_URL}/${clientConfig.bunnyCdn.basePath}/${clientConfig.bunnyCdn.resourcesFolder}/extensions.json`;
      console.log(`Fetching extensions from: ${extensionsUrl}`);
      
      const extensionsResponse = await fetch(extensionsUrl);
      console.log(`Extensions response status: ${extensionsResponse.status}`);
      
      if (extensionsResponse.ok) {
        const extensionsText = await extensionsResponse.text();
        console.log(`Extensions raw text length: ${extensionsText.length}`);
        
        extensionsData = JSON.parse(extensionsText);
        console.log('Successfully loaded protected extensions.json:', Object.keys(extensionsData));
      } else {
        const errorText = await extensionsResponse.text();
        console.warn(`Protected extensions.json not found (${extensionsResponse.status}): ${errorText}`);
      }
    } catch (extensionsError) {
      console.warn('Error loading protected extensions.json:', extensionsError);
      // Continue without extensions replacement
    }

    // Fetch the protected meshes.json file for KHR_materials_variants
    let protectedMeshesData = null;
    try {
      const meshesUrl = `https://${BUNNY_PULL_ZONE_URL}/${clientConfig.bunnyCdn.basePath}/${clientConfig.bunnyCdn.resourcesFolder}/meshes.json`;
      console.log(`Fetching meshes from: ${meshesUrl}`);
      
      const meshesResponse = await fetch(meshesUrl);
      console.log(`Meshes response status: ${meshesResponse.status}`);
      
      if (meshesResponse.ok) {
        const meshesText = await meshesResponse.text();
        protectedMeshesData = JSON.parse(meshesText);
        console.log('Successfully loaded protected meshes.json with', protectedMeshesData.length, 'meshes');
      } else {
        console.warn(`Protected meshes.json not found (${meshesResponse.status}), skipping mesh variant enhancement`);
      }
    } catch (meshesError) {
      console.warn('Error loading protected meshes.json:', meshesError);
      // Continue without mesh enhancement
    }
    
    // Create the modified GLTF structure - simply replace arrays with references to existing protected files
    const modifiedGltf = { ...gltfData };
    
    // Always reference the existing protected JSON files (no extraction/creation needed)
    modifiedGltf.materials = "materials.json";
    modifiedGltf.textures = "textures.json";
    
    // Handle images: keep first image (if any) in GLTF, reference external images.json for the rest
    const originalImages = gltfData.images || [];
    if (originalImages.length > 0) {
      // Keep only the first image in the GLTF
      modifiedGltf.images = [originalImages[0]];
      // Reference the existing protected images.json for additional images
      modifiedGltf.externalImagesUri = "images.json";
    } else {
      // No images in uploaded GLTF, but still reference external images
      modifiedGltf.images = [];
      modifiedGltf.externalImagesUri = "images.json";
    }

    // Replace extensions object with protected extensions.json content
    if (extensionsData) {
      modifiedGltf.extensions = extensionsData;
      console.log('Replaced extensions object with protected extensions.json content');
    } else {
      // Remove any existing extensions if no protected file found
      delete modifiedGltf.extensions;
      console.log('No protected extensions.json found, removed extensions object');
    }

    // Enhance meshes with KHR_materials_variants from protected meshes.json
    if (protectedMeshesData && modifiedGltf.meshes) {
      console.log('Processing mesh enhancement...');
      
      // Create a lookup map of protected meshes by name for efficient matching
      const protectedMeshMap = new Map();
      protectedMeshesData.forEach(protectedMesh => {
        if (protectedMesh.name) {
          protectedMeshMap.set(protectedMesh.name, protectedMesh);
        }
      });
      
      let enhancedMeshCount = 0;
      
      // Process each mesh in the uploaded GLTF
      modifiedGltf.meshes.forEach(uploadedMesh => {
        if (!uploadedMesh.name) {
          console.warn('Skipping mesh without name');
          return;
        }
        
        const protectedMesh = protectedMeshMap.get(uploadedMesh.name);
        if (!protectedMesh) {
          console.warn(`No protected mesh found for: ${uploadedMesh.name}`);
          return;
        }
        
        // Process each primitive in the uploaded mesh
        if (uploadedMesh.primitives && protectedMesh.primitives) {
          uploadedMesh.primitives.forEach((uploadedPrimitive, primitiveIndex) => {
            const protectedPrimitive = protectedMesh.primitives[primitiveIndex];
            
            if (protectedPrimitive && 
                protectedPrimitive.extensions && 
                protectedPrimitive.extensions.KHR_materials_variants) {
              
              // Initialize extensions object if it doesn't exist
              if (!uploadedPrimitive.extensions) {
                uploadedPrimitive.extensions = {};
              }
              
              // Copy over the KHR_materials_variants extension
              uploadedPrimitive.extensions.KHR_materials_variants = 
                protectedPrimitive.extensions.KHR_materials_variants;
              
              console.log(`Enhanced mesh "${uploadedMesh.name}" primitive ${primitiveIndex} with KHR_materials_variants`);
            }
          });
          
          enhancedMeshCount++;
        }
      });
      
      console.log(`Successfully enhanced ${enhancedMeshCount} meshes with material variants`);
    } else {
      console.log('No mesh enhancement performed - missing protected meshes data or uploaded meshes');
    }
    
    // Only upload the modified GLTF - no need to create/upload JSON files
    const basePath = clientConfig.bunnyCdn.basePath;
    const modifiedGltfContent = JSON.stringify(modifiedGltf, null, 2);
    
    try {
      // Upload the modified GLTF
      await uploadToBunny(`${basePath}/${filename}`, modifiedGltfContent, 'model/gltf+json');
      
      // Purge cache for the uploaded GLTF
      const gltfUrl = `https://${BUNNY_PULL_ZONE_URL}/${encodeURI(`${basePath}/${filename}`)}`;
      await purgeCache(gltfUrl);
      
      return NextResponse.json({
        success: true,
        message: `Successfully converted ${filename} to use existing material library and enhanced meshes`,
        conversion: {
          materialsReferenced: "materials.json",
          texturesReferenced: "textures.json", 
          imagesReferenced: "images.json",
          extensionsReplaced: extensionsData ? true : false,
          meshesEnhanced: protectedMeshesData ? true : false,
          originalImages: originalImages.length,
          imagesKeptInGltf: originalImages.length > 0 ? 1 : 0
        }
      });
      
    } catch (error) {
      console.error('Failed to upload converted GLTF:', error);
      throw error;
    }
    
  } catch (error: unknown) {
    console.error('Error in convert-gltf route:', error);
    
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    
    return NextResponse.json(
      { error: 'Failed to convert GLTF: ' + errorMessage },
      { status: 500 }
    );
  }
}