import { NextRequest, NextResponse } from 'next/server';
import { clients } from '@/config/clientConfig';

// Helper to extract the zone name and base path from the environment variable
const getStorageZoneDetails = () => {
    const storageZonePath = process.env.BUNNY_STORAGE_ZONE_NAME || '';
    const parts = storageZonePath.split('/');
    const zoneName = parts[0];
    const basePath = parts.slice(1).join('/');
    return { zoneName, basePath };
};

// Direct upload endpoint - bypasses Vercel Blob intermediate storage
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const filename = formData.get('filename') as string;
        const clientName = formData.get('client') as string;
        const isGlb = formData.get('isGlb') === 'true';

        if (!file || !filename || !clientName) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Validate client
        const clientConfig = clients[clientName as keyof typeof clients];
        if (!clientConfig) {
            return NextResponse.json({ error: 'Invalid client' }, { status: 400 });
        }

        // Read file as buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload directly to Bunny CDN
        const bunnyConfig = clientConfig.bunnyCdn;
        if (!bunnyConfig) {
            return NextResponse.json({ error: 'Bunny CDN not configured for this client' }, { status: 500 });
        }

        const accessKey = process.env.BUNNY_ACCESS_KEY;
        const region = process.env.BUNNY_REGION || '';

        if (!accessKey) {
            return NextResponse.json({ error: 'Bunny CDN credentials not configured' }, { status: 500 });
        }

        // Get storage zone details (handles maincdn/Client-Editor/ format)
        const { zoneName, basePath } = getStorageZoneDetails();

        // Construct the file path (similar to /api/upload)
        const modelBase = bunnyConfig.modelPath?.replace(/^\/+|\/+$/g, '') || '';
        const filePath = `${modelBase}/${filename}`;

        // Construct BunnyCDN storage API URL
        const hostname = region ? `${region}.storage.bunnycdn.com` : 'storage.bunnycdn.com';
        const bunnyPath = `/${zoneName}/${filePath}`;
        const bunnyUrl = `https://${hostname}${bunnyPath}`;

        console.log('Upload details:', {
            zoneName,
            basePath,
            modelBase,
            filePath,
            bunnyUrl,
            fileSize: buffer.length
        });

        // Upload to BunnyCDN
        const uploadResponse = await fetch(bunnyUrl, {
            method: 'PUT',
            headers: {
                'AccessKey': accessKey,
                'Content-Type': isGlb ? 'model/gltf-binary' : 'model/gltf+json',
                'Content-Length': buffer.length.toString(),
            },
            body: buffer,
        });

        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            console.error('BunnyCDN upload failed:', {
                status: uploadResponse.status,
                statusText: uploadResponse.statusText,
                error: errorText,
                url: bunnyUrl
            });
            return NextResponse.json(
                { error: `BunnyCDN upload failed: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorText}` },
                { status: 500 }
            );
        }

        console.log('Upload successful:', filename);

        // Return success with the CDN URL
        const cdnUrl = `${bunnyConfig.publicBaseUrl}/${filePath}`;
        return NextResponse.json({
            success: true,
            filename,
            url: cdnUrl,
        });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Upload failed' },
            { status: 500 }
        );
    }
}
