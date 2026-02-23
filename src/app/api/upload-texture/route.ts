import { NextRequest, NextResponse } from 'next/server';
import { getClientConfig } from '@/config/clientConfig';

const BUNNY_REGION = process.env.BUNNY_REGION || '';
const BASE_HOSTNAME = 'storage.bunnycdn.com';
const HOSTNAME = BUNNY_REGION ? `${BUNNY_REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY || '';
const PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL || 'cdn.charpstar.net';

const getStorageZoneDetails = () => {
  const storageZonePath = process.env.BUNNY_STORAGE_ZONE_NAME || '';
  const parts = storageZonePath.split('/');
  const zoneName = parts[0];
  const basePath = parts.slice(1).join('/');
  return { zoneName, basePath };
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const client = formData.get('client') as string;
    const createBackup = formData.get('createBackup') === 'true';

    console.log('Upload texture API called:', { 
      filename: file?.name, 
      size: file?.size, 
      type: file?.type, 
      client,
      createBackup 
    });

    if (!file || !client) {
      return NextResponse.json({ error: 'Missing file or client' }, { status: 400 });
    }

    const { zoneName, basePath } = getStorageZoneDetails();
    const clientConfig = getClientConfig(client);
    const imagesPath = clientConfig.bunnyCdn.imagesPath || `Client-Editor/${client.toLowerCase()}/images`;
    
    const filename = file.name;
    const ext = filename.split('.').pop() || 'png';
    const baseName = filename.substring(0, filename.lastIndexOf('.')) || filename;

    console.log('Storage details:', { zoneName, basePath, imagesPath, filename });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log('Buffer created:', buffer.length, 'bytes');

    if (createBackup) {
      try {
        const existingStorageUrl = `https://${HOSTNAME}/${zoneName}/${imagesPath}/${filename}`;
        console.log('Checking for existing file at:', existingStorageUrl);
        
        const existingRes = await fetch(existingStorageUrl, {
          headers: { 'AccessKey': ACCESS_KEY }
        });
        
        if (existingRes.ok) {
          const existingBuffer = Buffer.from(await existingRes.arrayBuffer());
          
          let backupNumber = 1;
          let backupFilename = `${baseName}_backup_${backupNumber}.${ext}`;
          let backupExists = true;
          
          while (backupExists && backupNumber < 100) {
            const checkUrl = `https://${HOSTNAME}/${zoneName}/${imagesPath}/${backupFilename}`;
            const checkRes = await fetch(checkUrl, { method: 'HEAD', headers: { 'AccessKey': ACCESS_KEY } });
            if (checkRes.ok) {
              backupNumber++;
              backupFilename = `${baseName}_backup_${backupNumber}.${ext}`;
            } else {
              backupExists = false;
            }
          }
          
          const backupPath = `/${zoneName}/${imagesPath}/${backupFilename}`;
          const backupUrl = `https://${HOSTNAME}${backupPath}`;

          console.log('Creating backup at:', backupUrl);

          const backupRes = await fetch(backupUrl, {
            method: 'PUT',
            headers: {
              'AccessKey': ACCESS_KEY,
              'Content-Type': file.type || 'image/png',
              'Content-Length': existingBuffer.length.toString(),
            },
            body: existingBuffer,
          });

          console.log(`Created backup: ${backupFilename}, status: ${backupRes.status}`);
        } else {
          console.log('No existing file to backup, status:', existingRes.status);
        }
      } catch (e) {
        console.warn('Backup creation warning:', e);
      }
    }

    const uploadPath = `/${zoneName}/${imagesPath}/${filename}`;
    const uploadUrl = `https://${HOSTNAME}${uploadPath}`;

    console.log('Uploading to Bunny:', uploadUrl);

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': ACCESS_KEY,
        'Content-Type': file.type || 'image/png',
        'Content-Length': buffer.length.toString(),
      },
      body: buffer,
    });

    console.log('Bunny upload response:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Bunny upload error:', errorText);
      throw new Error(`Bunny CDN upload failed: ${response.status} ${response.statusText}`);
    }

    const fileUrl = `https://${PULL_ZONE_URL}/${imagesPath}/${filename}`;
    const timestamp = Date.now();
    
    console.log(`Successfully uploaded texture: ${filename} (${buffer.length} bytes)`);
    console.log(`CDN URL: ${fileUrl}`);
    
    try {
      const purgeUrl = `https://api.bunny.net/purge?url=${encodeURIComponent(fileUrl)}`;
      console.log('Purging cache:', purgeUrl);
      
      const purgeResponse = await fetch(purgeUrl, {
        method: 'POST',
        headers: {
          'AccessKey': process.env.BUNNY_API_KEY || '',
        },
      });
      
      console.log('Purge response:', purgeResponse.status);
      
      if (purgeResponse.ok) {
        const purgeData = await purgeResponse.text();
        console.log(`Successfully purged cache for: ${fileUrl}`, purgeData);
      } else {
        const errorText = await purgeResponse.text();
        console.warn(`Cache purge failed: ${purgeResponse.status}`, errorText);
      }
    } catch (e) {
      console.warn('Cache purge warning:', e);
    }

    return NextResponse.json({
      success: true,
      filename,
      url: fileUrl,
      timestamp,
    });
  } catch (error) {
    console.error('Texture upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
