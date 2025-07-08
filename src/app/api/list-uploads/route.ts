import { NextRequest, NextResponse } from "next/server";
import https from "https";
import { getDefaultClientName, getClientConfig } from "@/config/clientConfig";

const REGION = process.env.BUNNY_REGION || "";
const BASE_HOSTNAME = "storage.bunnycdn.com";
const HOSTNAME = REGION ? `${REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;
const STORAGE_ZONE_PATH = process.env.BUNNY_STORAGE_ZONE_NAME || "";
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY || "";
const DEFAULT_CLIENT = getDefaultClientName();

// Helper to extract the zone name and base path from the environment variable
const getStorageZoneDetails = () => {
  const parts = STORAGE_ZONE_PATH.split("/");
  const zoneName = parts[0];
  const basePath = parts.slice(1).join("/");
  return { zoneName, basePath };
};

export async function GET(request: NextRequest) {
  try {
    // Log environment variables (without showing sensitive values)
    console.log("List-uploads environment check:", {
      hasRegion: !!REGION,
      hasStorageZonePath: !!STORAGE_ZONE_PATH,
      hasAccessKey: !!ACCESS_KEY,
      hostname: HOSTNAME,
    });

    // Validate required environment variables
    if (!STORAGE_ZONE_PATH) {
      console.error("Missing BUNNY_STORAGE_ZONE_NAME environment variable");
      return NextResponse.json(
        {
          error:
            "Server configuration error: Missing storage zone configuration",
        },
        { status: 500 }
      );
    }

    if (!ACCESS_KEY) {
      console.error("Missing BUNNY_ACCESS_KEY environment variable");
      return NextResponse.json(
        {
          error: "Server configuration error: Missing access key configuration",
        },
        { status: 500 }
      );
    }

    // Get client name from query params or use default
    const { searchParams } = new URL(request.url);
    const clientName = searchParams.get("client") || DEFAULT_CLIENT;

    // Get client-specific BunnyCDN configuration
    const clientConfig = getClientConfig(clientName);
    const { zoneName, basePath } = getStorageZoneDetails();

    // Construct the path to the uploads folder
    const uploadsPath = `${clientConfig.bunnyCdn.basePath}/Uploads/`;

    console.log(
      `Listing uploads for client: ${clientName}, path: ${uploadsPath}`
    );

    // List files in the uploads directory
    const listPromise = new Promise<string[]>((resolve, reject) => {
      const options = {
        method: "GET",
        host: HOSTNAME,
        path: `/${zoneName}/${uploadsPath}`,
        headers: {
          AccessKey: ACCESS_KEY,
        },
      };

      const req = https.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              const fileList = JSON.parse(data);
              // Extract just the filenames from the response
              const filenames = fileList
                .map((file: any) => file.ObjectName.split("/").pop())
                .filter((name: string) => name.endsWith(".gltf"));
              resolve(filenames);
            } catch (parseError) {
              console.error("Error parsing file list:", parseError);
              resolve([]);
            }
          } else {
            console.warn(
              `List files returned status ${res.statusCode}: ${data}`
            );
            resolve([]); // Return empty array instead of rejecting
          }
        });
      });

      req.on("error", (error) => {
        console.error(`Error listing files: ${error.message}`);
        resolve([]); // Return empty array instead of rejecting
      });

      req.end();
    });

    const filenames = await listPromise;

    return NextResponse.json({
      success: true,
      files: filenames,
      uploadsPath: uploadsPath,
    });
  } catch (error: unknown) {
    console.error("Error in list-uploads route:", error);

    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === "string") {
      errorMessage = error;
    }

    return NextResponse.json(
      { error: "Failed to list uploads: " + errorMessage },
      { status: 500 }
    );
  }
}
