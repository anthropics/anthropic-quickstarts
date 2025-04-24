"use client";

import React, { useState, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileUpload, readFileAsBase64, readFileAsText, readFileAsPDFText } from "@/lib/utils";
import FilePreview from "@/components/FilePreview";
import { Upload, File, XCircle, Loader2 } from "lucide-react";

const FileSidebar: React.FC = () => {
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file drop
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      await processFiles(droppedFiles);
    }
  };

  // Handle file selection via input
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(Array.from(e.target.files));
    }
  };

  // Process selected files
  const processFiles = async (selectedFiles: File[]) => {
    setIsUploading(true);
    setError(null);
    
    try {
      const newFiles = await Promise.all(
        selectedFiles.map(async (file) => {
          // Check if the file is too large (10MB limit)
          if (file.size > 10 * 1024 * 1024) {
            throw new Error(`File ${file.name} is too large (max 10MB)`);
          }
          
          // Validate file type
          const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain', 'text/csv', 'application/json'];
          if (!validTypes.includes(file.type)) {
            throw new Error(`Unsupported file type: ${file.type}`);
          }
          
          let isText = false;
          let base64 = '';
          
          // Process based on file type
          if (file.type.startsWith('text/') || file.type === 'application/json') {
            // For text files, read as text and then convert to base64
            const text = await readFileAsText(file);
            base64 = btoa(unescape(encodeURIComponent(text)));
            isText = true;
          } else if (file.type === 'application/pdf') {
            try {
              // For PDFs, extract text using PDF.js
              const text = await readFileAsPDFText(file);
              base64 = btoa(unescape(encodeURIComponent(text)));
              isText = true;
            } catch (err) {
              // If text extraction fails, use base64
              console.error("PDF text extraction failed, using base64 only");
              base64 = await readFileAsBase64(file);
            }
          } else {
            // For images and other binary files
            base64 = await readFileAsBase64(file);
          }
          
          return {
            fileName: file.name,
            mediaType: file.type,
            base64,
            isText,
            fileSize: file.size
          };
        })
      );
      
      setFiles((prevFiles) => [...prevFiles, ...newFiles]);
      
      // Upload the files to the server
      await Promise.all(
        newFiles.map(async (fileData) => {
          const response = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileData })
          });
          
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Upload failed');
          }
        })
      );
      
    } catch (err) {
      console.error('Error processing files:', err);
      setError(err instanceof Error ? err.message : 'Failed to process files');
    } finally {
      setIsUploading(false);
    }
  };

  // Remove a file
  const removeFile = (index: number) => {
    setFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
  };

  // Attach files to chat
  const attachToChat = (file: FileUpload) => {
    // Create a custom event that ChatArea will listen for
    window.dispatchEvent(
      new CustomEvent('fileAttached', {
        detail: file
      })
    );
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  return (
    <aside className="w-[380px] pl-4 overflow-hidden pb-4">
      <Card className="h-full overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-medium leading-none">File Upload</CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Drag and drop area */}
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragging 
                ? 'border-primary bg-primary/10' 
                : 'border-muted-foreground/20 hover:border-primary/50'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-1">
              Drag and drop files here
            </p>
            <p className="text-xs text-muted-foreground">
              Supports images, PDF, text, CSV, and JSON (max 10MB)
            </p>
            
            <div className="mt-4">
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  'Select Files'
                )}
              </Button>
              <Input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
                multiple
                accept="image/jpeg,image/png,image/gif,application/pdf,text/plain,text/csv,application/json"
              />
            </div>
          </div>
          
          {/* Error message */}
          {error && (
            <div className="text-destructive text-sm flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          
          {/* File list */}
          <div>
            <h3 className="text-sm font-medium mb-2">Uploaded Files</h3>
            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground">No files uploaded yet</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {files.map((file, index) => (
                  <div key={index} className="relative">
                    <FilePreview 
                      file={file} 
                      onRemove={() => removeFile(index)} 
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute bottom-0 left-0 right-0 h-6 text-xs opacity-0 hover:opacity-100 transition-opacity"
                      onClick={() => attachToChat(file)}
                    >
                      <File className="h-3 w-3 mr-1" />
                      Attach
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
        
        <CardFooter className="flex flex-col space-y-2 border-t p-4">
          <p className="text-xs text-muted-foreground">
            Files are processed securely on your device.
          </p>
        </CardFooter>
      </Card>
    </aside>
  );
};

export default FileSidebar;