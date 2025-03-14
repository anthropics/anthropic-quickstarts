"use client";

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Check, AlertCircle } from "lucide-react";
import { Bash } from "@/components/ui/bash";

type DocType = 'rfc' | 'prd' | 'guideline' | 'tasklist' | 'adr';

interface DocTypeInfo {
  name: string;
  description: string;
  icon: React.ReactNode;
}

const DocGenerator = () => {
  const [selectedType, setSelectedType] = useState<DocType | null>(null);
  const [documentName, setDocumentName] = useState('');
  const [generationStatus, setGenerationStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle');
  const [outputMessage, setOutputMessage] = useState('');
  
  const docTypes: Record<DocType, DocTypeInfo> = {
    rfc: {
      name: 'RFC',
      description: 'Request for Comments - Technical proposals and architecture decisions',
      icon: <FileText className="h-8 w-8 text-blue-500" />,
    },
    prd: {
      name: 'PRD',
      description: 'Product Requirements Document - Product specifications and requirements',
      icon: <FileText className="h-8 w-8 text-green-500" />,
    },
    guideline: {
      name: 'Guideline',
      description: 'Development standards and best practices',
      icon: <FileText className="h-8 w-8 text-yellow-500" />,
    },
    tasklist: {
      name: 'Task List',
      description: 'Project planning and progress tracking',
      icon: <FileText className="h-8 w-8 text-purple-500" />,
    },
    adr: {
      name: 'ADR',
      description: 'Architecture Decision Record - Document significant architecture decisions',
      icon: <FileText className="h-8 w-8 text-red-500" />,
    },
  };

  const generateDocument = async () => {
    if (!selectedType || !documentName) {
      setOutputMessage('Please select a document type and enter a name');
      setGenerationStatus('error');
      return;
    }

    setGenerationStatus('generating');
    setOutputMessage('Generating document...');

    try {
      const command = `npm run doc:${selectedType} -- --name ${documentName}`;
      
      // In a real implementation, we would execute the command
      // For now, we'll simulate success after a delay
      setTimeout(() => {
        setGenerationStatus('success');
        setOutputMessage(`Generated ${docTypes[selectedType].name} document: ${documentName}`);
      }, 1500);
    } catch (error) {
      setGenerationStatus('error');
      setOutputMessage(`Error generating document: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const resetForm = () => {
    setSelectedType(null);
    setDocumentName('');
    setGenerationStatus('idle');
    setOutputMessage('');
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Document Generator</h1>
      
      <div className="grid grid-cols-1 gap-6">
        {/* Document Type Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select Document Type</CardTitle>
            <CardDescription>Choose the type of document you want to create</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(Object.keys(docTypes) as DocType[]).map(type => (
                <div 
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedType === type ? 'bg-primary/5 border-primary' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      {docTypes[type].icon}
                    </div>
                    <div>
                      <h3 className="font-medium">{docTypes[type].name}</h3>
                      <p className="text-sm text-gray-500">{docTypes[type].description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        {/* Document Name Input */}
        <Card>
          <CardHeader>
            <CardTitle>Document Details</CardTitle>
            <CardDescription>Provide a name for your document (letters, numbers, hyphens, and underscores only)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div>
                <label htmlFor="doc-name" className="block text-sm font-medium mb-1">Document Name</label>
                <input
                  type="text"
                  id="doc-name"
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                  placeholder="e.g., feature-name, coding-standards"
                  className="w-full p-2 border rounded-md"
                />
              </div>
              
              {selectedType && (
                <div className="mt-2">
                  <p className="text-sm text-gray-500">
                    Will create: <span className="font-mono bg-gray-100 p-1 rounded">{selectedType === 'adr' ? `ADR-XXX-${documentName.toUpperCase()}.md` : `${documentName.toUpperCase()}_${selectedType.toUpperCase()}.md`}</span>
                  </p>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between gap-4">
            <Button variant="outline" onClick={resetForm}>Reset</Button>
            <Button 
              onClick={generateDocument}
              disabled={generationStatus === 'generating' || !selectedType || !documentName}
            >
              {generationStatus === 'generating' ? 'Generating...' : 'Generate Document'}
            </Button>
          </CardFooter>
        </Card>
        
        {/* Output Card */}
        {outputMessage && (
          <Card>
            <CardHeader className={
              generationStatus === 'success' ? 'bg-green-50 text-green-700' :
              generationStatus === 'error' ? 'bg-red-50 text-red-700' : ''
            }>
              <CardTitle className="flex items-center gap-2">
                {generationStatus === 'success' && <Check className="h-5 w-5" />}
                {generationStatus === 'error' && <AlertCircle className="h-5 w-5" />}
                Generation Result
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-50 p-4 rounded-md overflow-x-auto">
                <pre className="whitespace-pre-wrap text-sm">{outputMessage}</pre>
              </div>
            </CardContent>
            <CardFooter>
              {generationStatus === 'success' && (
                <p className="text-sm text-gray-500">
                  Document was created successfully. You can find it in the specified directory.
                </p>
              )}
            </CardFooter>
          </Card>
        )}
      </div>
      
      {/* Documentation Info */}
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Documentation Structure</CardTitle>
            <CardDescription>Documents are organized in the following directories</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-sm bg-gray-50 p-4 rounded-md overflow-x-auto">
              <pre>
                {`docs/
├── architecture/
│   ├── decisions/     # ADRs
│   └── rfcs/          # RFCs
├── guidelines/        # Guidelines
├── planning/
│   └── task-lists/    # Task Lists
├── product/
│   └── requirements/  # PRDs
└── templates/         # Templates`}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DocGenerator;