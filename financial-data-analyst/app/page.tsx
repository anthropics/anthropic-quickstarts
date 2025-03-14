// /app/page.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import TopNavBar from "@/components/TopNavBar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PieChart, BarChart3, ChevronRight } from "lucide-react";
import Image from "next/image";

export default function Home() {
  const router = useRouter();
  
  return (
    <div className="flex flex-col min-h-screen">
      <TopNavBar
        features={{
          showDomainSelector: false,
          showViewModeSelector: false,
          showPromptCaching: false,
        }}
      />
      
      <main className="flex-1">
        <div className="container px-4 py-8 mx-auto">
          <div className="flex flex-col items-center text-center mb-12">
            <h1 className="text-4xl font-bold tracking-tight mb-4">
              Financial Data & MCP Platform
            </h1>
            <p className="text-lg text-muted-foreground max-w-[800px]">
              Access powerful financial analysis and model context protocol tools with AI-assisted visualization, document analysis, and system monitoring.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-[1000px] mx-auto">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <PieChart className="h-5 w-5 mr-2" />
                  Financial Analysis
                </CardTitle>
                <CardDescription>
                  AI-powered financial data analysis and visualization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <Image 
                    src="/hero.png" 
                    alt="Financial Analysis Screenshot" 
                    width={450} 
                    height={300}
                    className="rounded-md w-full"
                  />
                </div>
                <ul className="space-y-2 mb-6">
                  <li className="flex items-start">
                    <ChevronRight className="h-5 w-5 mr-1 text-primary mt-0.5" />
                    <span>Upload and analyze CSV financial data</span>
                  </li>
                  <li className="flex items-start">
                    <ChevronRight className="h-5 w-5 mr-1 text-primary mt-0.5" />
                    <span>Generate interactive charts and insights</span>
                  </li>
                  <li className="flex items-start">
                    <ChevronRight className="h-5 w-5 mr-1 text-primary mt-0.5" />
                    <span>Ask questions in natural language</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onClick={() => router.push('/finance')}>
                  Launch Financial Analyst
                </Button>
              </CardFooter>
            </Card>
            
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2" />
                  MCP Dashboard
                </CardTitle>
                <CardDescription>
                  Model Context Protocol system monitoring and control
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 bg-gray-100 rounded-md p-4 h-[300px] flex items-center justify-center">
                  <div className="flex flex-col items-center text-center">
                    <BarChart3 className="h-16 w-16 mb-4 text-primary" />
                    <span className="text-lg font-medium">System Monitoring Dashboard</span>
                    <span className="text-sm text-muted-foreground">Monitor and control MCP microservices</span>
                  </div>
                </div>
                <ul className="space-y-2 mb-6">
                  <li className="flex items-start">
                    <ChevronRight className="h-5 w-5 mr-1 text-primary mt-0.5" />
                    <span>Monitor service health and status</span>
                  </li>
                  <li className="flex items-start">
                    <ChevronRight className="h-5 w-5 mr-1 text-primary mt-0.5" />
                    <span>View performance metrics in real-time</span>
                  </li>
                  <li className="flex items-start">
                    <ChevronRight className="h-5 w-5 mr-1 text-primary mt-0.5" />
                    <span>Control and configure microservices</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onClick={() => router.push('/mcp')}>
                  Launch MCP Dashboard
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </main>
      
      <footer className="border-t py-6 md:py-0">
        <div className="container flex flex-col items-center justify-between gap-4 md:h-16 md:flex-row">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Financial Data & MCP Platform. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground">
            Powered by Claude
          </p>
        </div>
      </footer>
    </div>
  );
}
