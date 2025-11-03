# Environment Variables Setup

Add these environment variables to your `.env` file and to Vercel's Environment Variables settings.

## Required Environment Variables

### Bunny CDN Configuration
```bash
BUNNY_REGION=se
BUNNY_STORAGE_ZONE_NAME=maincdn/Client-Editor/
BUNNY_ACCESS_KEY=your_bunny_access_key
BUNNY_API_KEY=your_bunny_api_key
BUNNY_PULL_ZONE_URL=cdn.charpstar.net
```

### Render Worker Configuration (RunPod)
```bash
RENDER_WORKER_BASE_URL=https://5vxrdjp4pb2eh3-8000.proxy.runpod.net
RENDER_WORKER_API_TOKEN=charpstar2024
RENDER_CALLBACK_TOKEN=charpstar2024
RENDER_PUBLIC_BASE_URL=https://your-vercel-app.vercel.app
```

### Render Preparation Worker (NEW - for Draco decoding)
```bash
RENDER_PREP_WORKER_URL=http://45.32.156.145:8080
```

### Apply Materials Worker
```bash
WORKER_BASE_URL=http://45.32.156.145:8080
WORKER_API_TOKEN=charpstar2024charpstar2024
```

## Vercel Setup

1. Go to your Vercel project → Settings → Environment Variables
2. Add all variables above
3. For Preview/Development branches, make sure to select the appropriate environments
4. Redeploy after adding variables

## Local Development

Create a `.env.local` file in the project root with all variables above for local development.

