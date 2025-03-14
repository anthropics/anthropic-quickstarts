"use client";

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ServiceData {
  id: string;
  name: string;
  port: number;
  description: string;
  features: string;
  dependencies: string;
}

interface EndpointData {
  service: string;
  endpoint: string;
  method: string;
  description: string;
  parameters: string;
}

interface CommandData {
  service: string;
  command: string;
  example: string;
  description: string;
}

const MCPSummaryTables = () => {
  const [activeTab, setActiveTab] = useState('services');

  // Services Overview Table Data
  const servicesData: ServiceData[] = [
    {
      id: 'api-hub',
      name: 'API Integration Hub',
      port: 3104,
      description: 'Centralized API integration service for connecting with external web services',
      features: 'API proxying, credential management, schema discovery, request logging',
      dependencies: 'axios, crypto, express'
    },
    {
      id: 'code-execution',
      name: 'Code Execution Service',
      port: 3106,
      description: 'Execute, analyze, and manage code in various programming languages',
      features: 'Code execution, secure sandboxing, code analysis, formatting, linting',
      dependencies: 'Docker, babel, tmp, dockerode'
    },
    {
      id: 'document-analysis',
      name: 'Document Analysis Service',
      port: 3101,
      description: 'Process and analyze documents of various formats including PDF, Word, and Excel',
      features: 'Text extraction, metadata extraction, summarization, entity recognition',
      dependencies: 'pdf-lib, mammoth, XLSX, natural'
    },
    {
      id: 'data-visualization',
      name: 'Data Visualization Service',
      port: 3102,
      description: 'Generate interactive charts and graphs from structured data',
      features: 'Chart generation, data transformation, visualization customization',
      dependencies: 'ChartJSNodeCanvas, d3, vega, vega-lite'
    },
    {
      id: 'nlp',
      name: 'Natural Language Processing Service',
      port: 3103,
      description: 'Advanced NLP capabilities including sentiment analysis and text classification',
      features: 'Sentiment analysis, named entity recognition, keyword extraction, classifiers',
      dependencies: 'natural, spellcheck, WordNet'
    },
    {
      id: 'vector-db',
      name: 'Vector Database Service',
      port: 3105,
      description: 'Store and retrieve vector embeddings for semantic search and memory',
      features: 'Vector storage, similarity search, memory persistence',
      dependencies: 'hnswlib-node, tensorflow, transformers'
    },
    {
      id: 'filesystem',
      name: 'Filesystem Server',
      port: 3000,
      description: 'Access and manipulate files across designated directories',
      features: 'File reading, writing, listing, and metadata retrieval',
      dependencies: 'fs, path, express'
    },
    {
      id: 'brave-search',
      name: 'Brave Search Server',
      port: 3001,
      description: 'Web search capabilities through the Brave Search API',
      features: 'Web search, local search',
      dependencies: 'axios, express'
    }
  ];
  
  // Endpoints Table Data
  const endpointsData: EndpointData[] = [
    {
      service: 'API Integration Hub',
      endpoint: '/api/integrations',
      method: 'POST, GET',
      description: 'Create and list API integrations',
      parameters: 'name, type, baseUrl, description, authType'
    },
    {
      service: 'API Integration Hub',
      endpoint: '/api/proxy/:id',
      method: 'POST',
      description: 'Proxy requests to external APIs',
      parameters: 'method, path, headers, params, data, useCache'
    },
    {
      service: 'Code Execution Service',
      endpoint: '/api/execute',
      method: 'POST',
      description: 'Execute code in various languages',
      parameters: 'code, language, inputs (optional)'
    },
    {
      service: 'Document Analysis Service',
      endpoint: '/api/documents/upload',
      method: 'POST',
      description: 'Upload document for analysis',
      parameters: 'file (multipart/form-data)'
    },
    {
      service: 'Document Analysis Service',
      endpoint: '/api/documents/:id/text',
      method: 'GET',
      description: 'Extract text from document',
      parameters: 'id (document ID)'
    },
    {
      service: 'Data Visualization Service',
      endpoint: '/api/visualize/csv',
      method: 'POST',
      description: 'Generate visualization from CSV data',
      parameters: 'csvData, chartType, options'
    },
    {
      service: 'Data Visualization Service',
      endpoint: '/api/charts/line',
      method: 'POST',
      description: 'Create line chart',
      parameters: 'data, options'
    },
    {
      service: 'NLP Service',
      endpoint: '/api/sentiment',
      method: 'POST',
      description: 'Analyze sentiment in text',
      parameters: 'text'
    },
    {
      service: 'NLP Service',
      endpoint: '/api/entities',
      method: 'POST',
      description: 'Extract named entities from text',
      parameters: 'text'
    },
    {
      service: 'Vector Database Service',
      endpoint: '/api/collections/:id/search',
      method: 'POST',
      description: 'Search for similar vectors',
      parameters: 'vector, k (number of results, default 5)'
    }
  ];
  
  // Command Syntax Table
  const commandSyntax: CommandData[] = [
    {
      service: 'Document Analysis Service',
      command: '@document.analyze [filename]',
      example: '@document.analyze contract.pdf',
      description: 'Analyze a document for content, structure, and metadata'
    },
    {
      service: 'Document Analysis Service',
      command: '@document.extract [filename] [type]',
      example: '@document.extract report.docx text',
      description: 'Extract specific content (text, tables, etc.) from a document'
    },
    {
      service: 'Data Visualization Service',
      command: '@visualization.create [data] [type] [options]',
      example: '@visualization.create sales.csv bar x:month y:revenue',
      description: 'Create a visualization from data'
    },
    {
      service: 'NLP Service',
      command: '@nlp.analyze [text] [tasks]',
      example: '@nlp.analyze "Customer feedback text" sentiment,entities',
      description: 'Perform NLP analysis tasks on text'
    },
    {
      service: 'Vector Database Service',
      command: '@vector.search [query] [options]',
      example: '@vector.search "When is the team meeting?" limit:3',
      description: 'Search vector database for semantically similar information'
    },
    {
      service: 'Code Execution Service',
      command: '@code.execute [language] [code]',
      example: '@code.execute python "import pandas as pd; print(pd.read_csv(\'data.csv\'))"',
      description: 'Execute code in specified language'
    },
    {
      service: 'API Integration Hub',
      command: '@api.call [service].[operation] [parameters]',
      example: '@api.call weather.get-current location:"New York, NY"',
      description: 'Call an external API through the integration hub'
    }
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Model Context Protocol Services Summary</h1>
      
      <div className="mb-6">
        <div className="flex border-b border-gray-200">
          <button 
            className={`py-2 px-4 font-medium ${activeTab === 'services' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('services')}
          >
            Services Overview
          </button>
          <button 
            className={`py-2 px-4 font-medium ${activeTab === 'endpoints' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('endpoints')}
          >
            API Endpoints
          </button>
          <button 
            className={`py-2 px-4 font-medium ${activeTab === 'commands' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('commands')}
          >
            Command Syntax
          </button>
        </div>
      </div>
      
      {/* Services Overview Table */}
      {activeTab === 'services' && (
        <Card>
          <CardHeader>
            <CardTitle>Services Overview</CardTitle>
            <CardDescription>Complete list of all MCP services and their core functionality</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service Name</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Port</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Key Features</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Core Dependencies</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {servicesData.map((service) => (
                  <tr key={service.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{service.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{service.port}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{service.description}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{service.features}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{service.dependencies}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      
      {/* API Endpoints Table */}
      {activeTab === 'endpoints' && (
        <Card>
          <CardHeader>
            <CardTitle>API Endpoints</CardTitle>
            <CardDescription>Key API endpoints for each MCP service</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Endpoint</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parameters</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {endpointsData.map((endpoint, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{endpoint.service}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-mono">{endpoint.endpoint}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{endpoint.method}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{endpoint.description}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{endpoint.parameters}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      
      {/* Command Syntax Table */}
      {activeTab === 'commands' && (
        <Card>
          <CardHeader>
            <CardTitle>Command Syntax Reference</CardTitle>
            <CardDescription>How to interact with services through Claude</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Command Syntax</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Example</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {commandSyntax.map((command, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{command.service}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-blue-600">{command.command}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">{command.example}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{command.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MCPSummaryTables;