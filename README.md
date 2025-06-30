# Charpstar Viewer

This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## BunnyCDN Configuration

To use the demo page with real models from BunnyCDN, you need to configure environment variables. Create a `.env.local` file in the root directory with:

```bash
# BunnyCDN Configuration
BUNNY_STORAGE_ZONE_NAME=your-storage-zone-name
BUNNY_ACCESS_KEY=your-bunny-access-key
BUNNY_REGION=
```

### Development Mode

If BunnyCDN is not configured, the application will use fallback data for development. This allows you to test the demo page functionality without needing BunnyCDN credentials.

### Production Mode

For production, you must configure the proper BunnyCDN credentials to fetch real model data.

## Client Configuration

The application supports multiple clients configured in `src/config/clientConfig.ts`. Each client has:

- Model URLs and paths
- HDR environment images
- Script paths for different viewers
- Security settings

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
