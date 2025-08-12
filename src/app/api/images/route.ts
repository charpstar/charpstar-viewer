import { NextRequest, NextResponse } from 'next/server'
import https from 'https'
import { getClientConfig } from '@/config/clientConfig'

const REGION = process.env.BUNNY_REGION || ''
const BASE_HOSTNAME = 'storage.bunnycdn.com'
const HOSTNAME = REGION ? `${REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME
const STORAGE_ZONE_PATH = process.env.BUNNY_STORAGE_ZONE_NAME || ''
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY || ''
const BUNNY_PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL || 'cdn.charpstar.net'

const getStorageZoneDetails = () => {
  const parts = STORAGE_ZONE_PATH.split('/')
  const zoneName = parts[0]
  return { zoneName }
}

const purgeCache = async (fileUrl: string): Promise<void> => {
  try {
    await fetch('https://api.bunny.net/purge?async=false', {
      method: 'POST',
      headers: {
        'AccessKey': process.env.BUNNY_API_KEY || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ urls: [fileUrl] })
    })
  } catch {}
}

// GET: List images under images/ for the client's basePath
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const client = searchParams.get('client')
    if (!client) return NextResponse.json({ error: 'client is required' }, { status: 400 })
    const clientConfig = getClientConfig(client)
    const { zoneName } = getStorageZoneDetails()
    const dirPath = `/${zoneName}/${clientConfig.bunnyCdn.basePath}/images/`

    // Bunny Storage API directory listing
    const list = await new Promise<any[]>((resolve, reject) => {
      const options = {
        method: 'GET',
        host: HOSTNAME,
        path: dirPath,
        headers: { AccessKey: ACCESS_KEY }
      } as const
      const req = https.request(options, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            resolve(Array.isArray(json) ? json : [])
          } catch (e) {
            resolve([])
          }
        })
      })
      req.on('error', reject)
      req.end()
    })

    const images = list
      .filter((e: any) => e && e.ObjectName && !e.IsDirectory)
      .map((e: any) => ({
        name: e.ObjectName as string,
        uri: e.ObjectName as string,
        size: e.Length,
        lastModified: e.LastChanged
      }))

    return NextResponse.json({ images })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to list images' }, { status: 500 })
  }
}

// POST: Upload an image (multipart/form-data: file)
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const client = searchParams.get('client')
    if (!client) return NextResponse.json({ error: 'client is required' }, { status: 400 })
    const clientConfig = getClientConfig(client)

    const form = await request.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    let filename = ((form.get('filename') as string) || file.name || '').toString()
    // Ensure .png/.jpg/.jpeg extension
    const lower = filename.toLowerCase()
    const hasExt = /\.(png|jpg|jpeg)$/.test(lower)
    if (!hasExt) {
      const origLower = (file.name || '').toLowerCase()
      const m = origLower.match(/\.(png|jpg|jpeg)$/)
      const ext = m ? m[0] : '.jpg'
      filename = `${filename}${ext}`
    }
    // Sanitize
    filename = filename.split(/[/\\]/).pop() || filename
    filename = filename.replace(/[^A-Za-z0-9._-]/g, '_')
    if (!filename) return NextResponse.json({ error: 'filename is required' }, { status: 400 })

    const { zoneName } = getStorageZoneDetails()
    const storagePath = `${clientConfig.bunnyCdn.basePath}/images/${filename}`

    await new Promise<void>((resolve, reject) => {
      const options = {
        method: 'PUT',
        host: HOSTNAME,
        path: `/${zoneName}/${storagePath}`,
        headers: {
          AccessKey: ACCESS_KEY,
          'Content-Type': file.type || 'application/octet-stream',
          'Content-Length': buffer.length,
        },
      } as const
      const req = https.request(options, (res) => {
        if (res.statusCode === 200 || res.statusCode === 201) resolve()
        else reject(new Error(`Upload failed: ${res.statusCode}`))
      })
      req.on('error', reject)
      req.write(buffer)
      req.end()
    })

    await purgeCache(`https://${BUNNY_PULL_ZONE_URL}/${storagePath}`)
    return NextResponse.json({ success: true, name: filename })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
  }
}


