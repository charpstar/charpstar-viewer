// src/app/api/models/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { clients } from '@/config/clients';

// Load all models from paste.txt content
const getAllModels = () => {
  try {
    // For this demo, we'll use the content from paste.txt directly
    // In production, this would come from your actual model directory
    const pasteContent = `ZEB-210X210-R-L-WOL.gltf
ANT-25.gltf
ANT-25-LC.gltf
ANT-35.gltf
ANT-35-LC.gltf
BEC-90X200.gltf
BEC-120X200.gltf
BEC-140X200.gltf
BEC-160X200.gltf
BEC-180X200.gltf
BJO-3.gltf
BJO-15CHL.gltf
BJO-CHL15.gltf
BJO-FOOT1.gltf
BLA-5.gltf
BLA-5-LC.gltf
BLA-5-RI.gltf
BLA-25C25.gltf
BLA-25C25-LC.gltf
BLA-25C25-RI.gltf
BLA-25E.gltf
BLA-25E-LC.gltf
BLA-25E-RI.gltf
BLA-C90.gltf
BLA-C90-LC.gltf
BLA-C90-RI.gltf
BLA-E25.gltf
BLA-E25-LC.gltf
BLA-E25-RI.gltf
VAL-1.gltf
VAL-1-LC.gltf
VAL-1-RI.gltf
VAL-3.gltf
VAL-3C3.gltf
VAL-3C3-RI.gltf
VAL-3C15.gltf
VAL-3C15-RI.gltf
VAL-3-LC.gltf
VAL-3-RI.gltf
VAL-4.gltf
VAL-4-LC.gltf
VAL-4-RI.gltf
VAL-15.gltf
VAL-15C3.gltf
VAL-15C3-RI.gltf
VAL-15CHL.gltf
VAL-15CHL-RI.gltf
VAL-15COZY.gltf
VAL-15COZY-RI.gltf
VAL-15-LC.gltf
VAL-15-RI.gltf
VAL-35.gltf
VAL-35-LC.gltf
VAL-35-RI.gltf
VAL-CHL15.gltf
VAL-CHL15-RI.gltf
VAL-COZY15.gltf
VAL-COZY15-RI.gltf
VAL-FOOT1.gltf
VAL-FOOT1-LC.gltf
VAL-FOOT1-RI.gltf
VAL-FOOT2.gltf
VAL-FOOT2-LC.gltf
VAL-FOOT2-RI.gltf
LEJ-1.gltf
LEJ-1-AR.gltf
LEJ-1-LC.gltf
LEJ-2.gltf
LEJ-2-LC.gltf
LEJ-2-ROUND.gltf
LEJ-2-ROUND-LC.gltf
LEJ-3.gltf
LEJ-3-LC.gltf
LEJ-3-ROUND.gltf
LEJ-3-ROUND-LC.gltf
LEJ-25-ROUND.gltf
LEJ-25-ROUND-LC.gltf
LEJ-FOOT1.gltf
LEJ-FOOT1-LC.gltf
LEJ-FOOT2.gltf
LEJ-FOOT2-LC.gltf
ZEB-90X200.gltf
ZEB-120X200.gltf
ZEB-140X200.gltf
ZEB-160X200.gltf
ZEB-160X200-L-CHL.gltf
ZEB-160X200-L-WOL.gltf
ZEB-160X200-PL.gltf
ZEB-160X200-PL-L-CHL.gltf
ZEB-160X200-PL-L-WOL.gltf
ZEB-160X200-R.gltf
ZEB-160X200-R-L-CHL.gltf
ZEB-160X200-R-L-WOL.gltf
ZEB-180X200.gltf
ZEB-180X200-L-CHL.gltf
ZEB-180X200-L-WOL.gltf
ZEB-180X200-PL.gltf
ZEB-180X200-PL-L-CHL.gltf
ZEB-180X200-PL-L-WOL.gltf
ZEB-180X200-R.gltf
ZEB-180X200-R-L-CHL.gltf
ZEB-180X200-R-L-WOL.gltf
ZEB-210X210.gltf
ZEB-210X210-L-CHL.gltf
ZEB-210X210-L-WOL.gltf
ZEB-210X210-PL.gltf
ZEB-210X210-PL-L-CHL.gltf
ZEB-210X210-PL-L-WOL.gltf
ZEB-210X210-R.gltf
ZEB-210X210-R-L-CHL.gltf`;

    return pasteContent.split('\n').filter(line => line.trim() !== '');
  } catch (error) {
    console.error('Error loading models from paste.txt:', error);
    return [];
  }
};

// Get client models with basic filtering
const getClientModels = async (clientName: string) => {
  // In a real implementation, this would fetch the model list from the server
  // For this demo, we'll use the sample data from paste.txt
  const allModels = getAllModels();
  
  // Filter models based on client (in a real implementation)
  // For demo purposes, we'll return all models for any valid client
  return allModels;
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
    
    return NextResponse.json(models);
  } catch (error) {
    console.error('Error fetching model list:', error);
    return NextResponse.json(
      { error: 'Failed to fetch models' },
      { status: 500 }
    );
  }
}