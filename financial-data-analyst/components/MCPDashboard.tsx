"use client";

import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown } from "lucide-react";

type ServerStatus = 'running' | 'stopped' | 'warning';

interface Server {
  id: string;
  name: string;
  status: ServerStatus;
  port: number;
  uptime: string;
}

interface MetricData {
  time: string;
  cpu: number;
  memory: number;
  requests: number;
}

const MCPDashboard = () => {
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [serverMetrics, setServerMetrics] = useState<MetricData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch server status
    const fetchServers = async () => {
      setIsLoading(true);
      try {
        // In a real app, this would be an API call
        const mockServerData = [
          { id: 'filesystem', name: 'Filesystem Server', status: 'running', port: 3000, uptime: '2d 5h 30m' },
          { id: 'brave-search', name: 'Brave Search Server', status: 'running', port: 3001, uptime: '2d 5h 29m' },
          { id: 'memory', name: 'Memory Server', status: 'running', port: 3002, uptime: '1d 2h 45m' },
          { id: 'neon', name: 'Neon Database Server', status: 'stopped', port: 3003, uptime: '0' },
          { id: 'git', name: 'Git Server', status: 'running', port: 3004, uptime: '2d 5h 28m' },
          { id: 'puppeteer', name: 'Puppeteer Server', status: 'running', port: 3005, uptime: '2d 5h 28m' },
          { id: 'github', name: 'GitHub Server', status: 'warning', port: 3006, uptime: '2d 5h 28m' },
          { id: 'custom-prompts', name: 'Custom Prompts Server', status: 'running', port: 3010, uptime: '2d 5h 27m' },
          { id: 'custom-tools', name: 'Custom Tools Server', status: 'running', port: 3200, uptime: '2d 5h 27m' },
          { id: 'sequential-thinking', name: 'Sequential Thinking Server', status: 'running', port: 3007, uptime: '2d 5h 27m' }
        ];
        setServers(mockServerData);
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching servers:', error);
        setIsLoading(false);
      }
    };

    fetchServers();
    const interval = setInterval(fetchServers, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Fetch metrics for selected server
    if (selectedServer) {
      // Mock metrics data
      const mockMetricsData = Array.from({ length: 24 }, (_, i) => ({
        time: `${i}:00`,
        cpu: Math.floor(Math.random() * 40) + 10,
        memory: Math.floor(Math.random() * 30) + 20,
        requests: Math.floor(Math.random() * 50) + 5
      }));
      setServerMetrics(mockMetricsData);
    }
  }, [selectedServer]);

  const getStatusColor = (status: ServerStatus): string => {
    switch (status) {
      case 'running': return 'bg-green-500';
      case 'stopped': return 'bg-red-500';
      case 'warning': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const handleServerAction = (serverId: string, action: 'start' | 'stop' | 'restart') => {
    // This would trigger server start/stop/restart API calls
    console.log(`${action} server ${serverId}`);
    
    // Update UI optimistically
    if (action === 'start') {
      setServers(servers.map(s => s.id === serverId ? {...s, status: 'running'} : s));
    } else if (action === 'stop') {
      setServers(servers.map(s => s.id === serverId ? {...s, status: 'stopped'} : s));
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Model Context Protocol Dashboard</h1>
      
      {isLoading ? (
        <div className="text-center py-10">Loading server status...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <Card>
              <CardHeader>
                <CardTitle>Server Status</CardTitle>
                <CardDescription>Status of all MCP microservices</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {servers.map(server => (
                    <div key={server.id} className="flex items-center justify-between p-3 border rounded hover:bg-gray-50 cursor-pointer"
                         onClick={() => setSelectedServer(server)}>
                      <div className="flex items-center">
                        <div className={`w-3 h-3 rounded-full mr-3 ${getStatusColor(server.status)}`}></div>
                        <span className="font-medium">{server.name}</span>
                      </div>
                      <div className="flex space-x-2">
                        {server.status === 'running' && (
                          <Button 
                            variant="destructive"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleServerAction(server.id, 'stop'); }}
                          >
                            Stop
                          </Button>
                        )}
                        {server.status === 'stopped' && (
                          <Button 
                            variant="default"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleServerAction(server.id, 'start'); }}
                          >
                            Start
                          </Button>
                        )}
                        <Button 
                          variant="outline"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleServerAction(server.id, 'restart'); }}
                        >
                          Restart
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>System Health</CardTitle>
                <CardDescription>Current system metrics and health status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="text-sm text-gray-500">Running Servers</div>
                    <div className="text-2xl font-bold">{servers.filter(s => s.status === 'running').length} / {servers.length}</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="text-sm text-gray-500">Warning/Error State</div>
                    <div className="text-2xl font-bold">{servers.filter(s => s.status === 'warning' || s.status === 'stopped').length}</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="text-sm text-gray-500">System CPU</div>
                    <div className="text-2xl font-bold">28%</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="text-sm text-gray-500">System Memory</div>
                    <div className="text-2xl font-bold">1.2GB / 4GB</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {selectedServer && (
            <Card>
              <CardHeader>
                <CardTitle>{selectedServer.name} Details</CardTitle>
                <CardDescription>Performance metrics and service details</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="text-sm text-gray-500">Status</div>
                    <div className="text-lg font-medium capitalize">{selectedServer.status}</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="text-sm text-gray-500">Port</div>
                    <div className="text-lg font-medium">{selectedServer.port}</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="text-sm text-gray-500">Uptime</div>
                    <div className="text-lg font-medium">{selectedServer.uptime}</div>
                  </div>
                </div>
                
                <div className="h-64">
                  <h3 className="text-lg font-medium mb-2">Performance Metrics</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={serverMetrics}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="cpu" stroke="#8884d8" name="CPU %" />
                      <Line type="monotone" dataKey="memory" stroke="#82ca9d" name="Memory (MB)" />
                      <Line type="monotone" dataKey="requests" stroke="#ffc658" name="Requests/min" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default MCPDashboard;