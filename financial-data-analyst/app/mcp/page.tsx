"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import TopNavBar from "@/components/TopNavBar";
import MCPDashboard from "@/components/MCPDashboard";
import MCPSummaryTables from "@/components/MCPSummaryTables";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileText, BarChart3, Server, ArrowRight } from "lucide-react";

export default function MCPPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("dashboard");
  
  const onTabChange = (value: string) => {
    setActiveTab(value);
  };
  
  return (
    <div className="flex flex-col min-h-screen">
      <TopNavBar
        features={{
          showDomainSelector: false,
          showViewModeSelector: false,
          showPromptCaching: false,
        }}
      />
      
      <main className="flex-1 pb-12">
        <div className="mx-auto container px-4 pt-6">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Model Context Protocol Platform</CardTitle>
              <CardDescription>
                A comprehensive microservices platform for AI model context management and integration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 border-b flex gap-4">
                <Button 
                  variant={activeTab === "dashboard" ? "default" : "ghost"}
                  onClick={() => onTabChange("dashboard")}
                  className={activeTab === "dashboard" ? "" : "text-muted-foreground"}
                >
                  Dashboard
                </Button>
                <Button 
                  variant={activeTab === "services" ? "default" : "ghost"}
                  onClick={() => onTabChange("services")}
                  className={activeTab === "services" ? "" : "text-muted-foreground"}
                >
                  Services
                </Button>
              </div>
              
              {activeTab === "dashboard" && <MCPDashboard />}
              {activeTab === "services" && <MCPSummaryTables />}
            </CardContent>
          </Card>
          
          {/* Tools and Resources Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-500" />
                  <CardTitle>Document Generator</CardTitle>
                </div>
                <CardDescription>
                  Create standardized documentation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">
                  Generate RFCs, PRDs, ADRs, guidelines, and task lists using predefined templates and standardized formats.
                </p>
              </CardContent>
              <CardFooter>
                <Button 
                  variant="outline" 
                  className="w-full justify-between"
                  onClick={() => router.push('/mcp/docs')}
                >
                  <span>Open Document Generator</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
            
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-green-500" />
                  <CardTitle>Data Visualization</CardTitle>
                </div>
                <CardDescription>
                  Generate charts and data visualizations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">
                  Create line charts, bar charts, pie charts, scatter plots and heatmaps from your data.
                </p>
              </CardContent>
              <CardFooter>
                <Button variant="outline" className="w-full justify-between opacity-50" disabled>
                  <span>Coming Soon</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
            
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-purple-500" />
                  <CardTitle>MCP Configuration</CardTitle>
                </div>
                <CardDescription>
                  Configure Model Context Protocol servers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">
                  Add, remove, and manage MCP server configurations to enhance AI capabilities.
                </p>
              </CardContent>
              <CardFooter>
                <Button variant="outline" className="w-full justify-between opacity-50" disabled>
                  <span>Coming Soon</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}