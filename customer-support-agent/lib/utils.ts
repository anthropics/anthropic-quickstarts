import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface RAGSource {
  title: string;
  content: string;
  score: number;
  source_type: string;
}

export async function retrieveContext(
  query: string,
  knowledgeBaseId: string,
): Promise<{ 
  context: string; 
  isRagWorking: boolean; 
  ragSources?: RAGSource[];
}> {
  // This is a mock implementation that would be replaced with real RAG logic
  console.log(`RAG query for "${query}" on KB ${knowledgeBaseId}`);
  
  // For demo purposes, conditionally return context for some types of queries
  const containsRelevantTerms = 
    query.toLowerCase().includes("claude") || 
    query.toLowerCase().includes("anthropic") ||
    query.toLowerCase().includes("model") ||
    query.toLowerCase().includes("assistant") ||
    query.toLowerCase().includes("help") ||
    query.toLowerCase().includes("support") ||
    query.toLowerCase().includes("feature") ||
    query.toLowerCase().includes("api") ||
    query.toLowerCase().includes("version");
  
  if (!containsRelevantTerms) {
    return { 
      context: "", 
      isRagWorking: true,
      ragSources: []
    };
  }
  
  // Mock retrieved sources
  const mockSources: RAGSource[] = [
    {
      title: "Claude 3 Model Family Documentation",
      content: "The Claude 3 model family includes Opus, Sonnet, and Haiku variants, with different capabilities and performance characteristics. Claude 3.5 Sonnet has now been released with significant improvements.",
      score: 0.95,
      source_type: "documentation"
    },
    {
      title: "Anthropic API Reference",
      content: "The Anthropic API allows developers to integrate Claude models into their applications. API keys are required for authentication.",
      score: 0.87,
      source_type: "api_docs"
    },
    {
      title: "File Upload Capabilities",
      content: "Claude 3 models support file uploads including images, PDFs, and text files. These can be sent as messages for analysis.",
      score: 0.81,
      source_type: "feature_docs"
    }
  ];
  
  // Create a context string from the sources
  const context = mockSources
    .map(source => `Source: ${source.title}\n${source.content}`)
    .join("\n\n");
  
  return {
    context,
    isRagWorking: true,
    ragSources: mockSources
  };
}

// File handling utility functions
export const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = reader.result;
        if (typeof result === "string" && result.length > 0) {
          resolve(result);
        } else {
          reject(new Error("Empty or invalid text file"));
        }
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

export const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const base64 = (reader.result as string).split(",")[1];
        resolve(base64);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const readFileAsPDFText = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";

    script.onload = async () => {
      try {
        // @ts-ignore - PDF.js adds this to window
        const pdfjsLib = window["pdfjs-dist/build/pdf"];
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          "//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();

          let lastY: number | null = null;
          let text = "";

          for (const item of textContent.items) {
            if (lastY !== null && Math.abs(lastY - item.transform[5]) > 5) {
              text += "\n";
            } else if (lastY !== null && text.length > 0) {
              text += " ";
            }

            text += item.str;
            lastY = item.transform[5];
          }

          fullText += text + "\n\n";
        }

        document.body.removeChild(script);
        resolve(fullText.trim());
      } catch (error) {
        document.body.removeChild(script);
        reject(error);
      }
    };

    script.onerror = () => {
      document.body.removeChild(script);
      reject(new Error("Failed to load PDF.js library"));
    };

    document.body.appendChild(script);
  });
};

// File upload interface
export interface FileUpload {
  base64: string;
  fileName: string;
  mediaType: string;
  isText?: boolean;
  fileSize?: number;
}
