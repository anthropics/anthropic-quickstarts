import { NextRequest } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { fileData } = await req.json();

    if (!fileData || !fileData.base64 || !fileData.fileName || !fileData.mediaType) {
      return new Response(JSON.stringify({ error: "Invalid file data" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate file size (base64 is ~33% larger than the original file)
    const base64Size = fileData.base64.length * 0.75; // Approximate original size
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    
    if (base64Size > MAX_SIZE) {
      return new Response(JSON.stringify({ error: "File too large (max 10MB)" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate file type
    const allowedTypes = [
      "image/jpeg", 
      "image/png", 
      "image/gif", 
      "application/pdf", 
      "text/plain",
      "text/csv", 
      "application/json"
    ];
    
    if (!allowedTypes.includes(fileData.mediaType)) {
      return new Response(JSON.stringify({ 
        error: "Unsupported file type. Accepted formats: JPEG, PNG, GIF, PDF, TXT, CSV, JSON" 
      }), { 
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Store the file or process it here if needed
    // For this demo, we'll just acknowledge receipt
    return new Response(JSON.stringify({ 
      message: "File uploaded successfully",
      fileName: fileData.fileName,
      fileType: fileData.mediaType,
      fileSize: Math.round(base64Size / 1024) + "KB" 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error processing upload:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "An unknown error occurred during upload" 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}