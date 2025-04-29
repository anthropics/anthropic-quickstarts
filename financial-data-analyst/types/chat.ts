// types/chat.ts
import type { ChartData } from "./chart";

export interface Message {
  id: string;
  role: string;
  content: string;
  hasToolUse?: boolean;
  file?: {
    base64: string;
    fileName: string;
    mediaType: string;
    isText?: boolean;
  };
  chartData?: ChartData;
}

export interface FileUpload {
  base64: string;
  fileName: string;
  mediaType: string;
  isText?: boolean;
  fileSize?: number;
}

export type Model = {
  id: string;
  name: string;
};

export interface APIResponse {
  content: string;
  hasToolUse: boolean;
  toolUse?: {
    type: "tool_use";
    id: string;
    name: string;
    input: ChartData;
  };
  chartData?: ChartData;
}