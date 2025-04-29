"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { 
  PanelLeft, 
  MessageSquarePlus, 
  Clock, 
  Trash2, 
  Edit, 
  Check,
  X,
  ChartBar
} from "lucide-react";
import type { ChatSession } from "@/utils/chatStorage";
import { 
  getAllChats, 
  deleteChat, 
  createNewChat, 
  updateChatTitle 
} from "@/utils/chatStorage";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

interface LeftNavBarProps {
  currentChatId: string | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  selectedModel: string;
}

export default function LeftNavBar({
  currentChatId,
  expanded,
  onToggleExpand,
  onSelectChat,
  onNewChat,
  selectedModel
}: LeftNavBarProps) {
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [editChatId, setEditChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  
  // Load chats from localStorage
  useEffect(() => {
    const loadChats = () => {
      const loadedChats = getAllChats();
      // Sort by updatedAt, newest first
      loadedChats.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      setChats(loadedChats);
    };
    
    // Initial load
    loadChats();
    
    // Add event listener for storage changes
    const handleStorageChange = (e: StorageEvent | CustomEvent) => {
      if (!e || (e instanceof StorageEvent && e.key === "financial-analyst-chats")) {
        loadChats();
      }
    };
    
    // Listen for both localStorage events and custom events
    window.addEventListener("storage", handleStorageChange);
    
    // Create an interval to check for changes periodically
    // This ensures that changes made in the current window are reflected
    const intervalId = setInterval(loadChats, 1000);
    
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(intervalId);
    };
  }, []);
  
  const handleCreateNewChat = () => {
    onNewChat();
  };
  
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };
  
  const handleConfirmDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleteChat(id)) {
      setChats(chats.filter(chat => chat.id !== id));
      toast({
        title: "Chat deleted",
        description: "The chat has been removed"
      });
      
      // If deleting current chat, create a new one
      if (id === currentChatId) {
        onNewChat();
      }
    } else {
      toast({
        title: "Error",
        description: "Failed to delete chat",
        variant: "destructive"
      });
    }
    setDeleteConfirmId(null);
  };
  
  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(null);
  };
  
  const handleEditChat = (chat: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditChatId(chat.id);
    setEditTitle(chat.title);
  };
  
  const handleSaveTitle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (updateChatTitle(id, editTitle)) {
      setChats(
        chats.map(chat => 
          chat.id === id 
            ? { ...chat, title: editTitle } 
            : chat
        )
      );
      setEditChatId(null);
    }
  };
  
  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditChatId(null);
  };
  
  // Format date to a readable format
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  // Generate a title preview (first message or truncated title)
  const getTitlePreview = (chat: ChatSession): string => {
    // If we have a custom title (not "New Chat"), use that
    if (chat.title !== "New Chat") return chat.title;
    
    // Try to generate title from first message
    const firstUserMsg = chat.messages.find(m => m.role === "user");
    if (firstUserMsg) {
      const content = firstUserMsg.content;
      // Get a clear, focused first line for the title
      const firstLine = content.split('\n')[0].trim();
      
      // If there's a file attached, try to use that in the title
      const hasFile = firstUserMsg.file;
      const fileName = hasFile ? firstUserMsg.file.fileName.split('.')[0] : '';
      
      if (hasFile && firstLine.length < 10) {
        return `Analysis of ${fileName}`;
      }
      
      // Use first line for title, truncate if too long
      const preview = firstLine.substring(0, 30);
      return preview.length < firstLine.length ? `${preview}...` : preview;
    }
    
    // Check if this chat has charts
    if (chat.messages.some(m => m.chartData)) {
      return "Chart Analysis";
    }
    
    // Fallback to default title
    return "New Chat";
  };
  
  return (
    <div 
      className={`flex flex-col h-[calc(100vh-4rem)] border-r bg-background transition-all duration-300 ease-in-out ${
        expanded ? "w-60" : "w-16"
      }`}
    >
      <div className="flex items-center justify-between p-3 border-b">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onToggleExpand}
          className="shrink-0"
        >
          <PanelLeft className="h-[1.2rem] w-[1.2rem]" />
        </Button>
        {expanded && <div className="font-medium">Chats</div>}
      </div>
      
      <Button
        variant="ghost"
        className={`flex justify-${expanded ? "start" : "center"} mb-2 mt-2 mx-2`}
        onClick={handleCreateNewChat}
      >
        <MessageSquarePlus className="h-5 w-5 mr-2" />
        {expanded && "New Chat"}
      </Button>
      
      <div className="flex-1 overflow-auto px-1">
        {chats.map(chat => (
          <div 
            key={chat.id}
            onClick={() => onSelectChat(chat.id)} 
            className={`
              flex items-center gap-2 p-2 rounded-md cursor-pointer my-1
              ${chat.id === currentChatId ? "bg-secondary" : "hover:bg-secondary/50"}
              ${expanded ? "" : "justify-center"}
              group transition-colors
            `}
          >
            {chat.messages.some(m => m.chartData) ? (
              <ChartBar className={`h-4 w-4 shrink-0 ${expanded ? "" : "mx-auto"} text-primary`} />
            ) : (
              <Clock className={`h-4 w-4 shrink-0 ${expanded ? "" : "mx-auto"}`} />
            )}
            
            {expanded && (
              <div className="flex-1 min-w-0">
                {editChatId === chat.id ? (
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className="flex-1 min-w-0 h-5 text-xs rounded border px-1"
                      autoFocus
                    />
                    <button onClick={e => handleSaveTitle(chat.id, e)} className="text-green-500">
                      <Check className="h-3 w-3" />
                    </button>
                    <button onClick={handleCancelEdit} className="text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 w-full">
                    <div className="truncate text-sm flex-1">
                      {getTitlePreview(chat)}
                    </div>
                    <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={e => handleEditChat(chat, e)} 
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Edit className="h-3 w-3" />
                      </button>
                      {deleteConfirmId === chat.id ? (
                        <div className="flex items-center ml-1">
                          <button 
                            onClick={e => handleConfirmDelete(chat.id, e)} 
                            className="text-green-500 hover:text-green-600"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button 
                            onClick={handleCancelDelete} 
                            className="text-red-500 hover:text-red-600 ml-1"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={e => handleDeleteClick(chat.id, e)} 
                          className="text-muted-foreground hover:text-red-500 ml-1"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <p className="text-xs text-muted-foreground truncate">
                    {formatDate(chat.updatedAt)}
                  </p>
                  {chat.messages.some(m => m.chartData) && expanded && (
                    <Badge variant="outline" className="text-[0.6rem] h-4 py-0 px-1">
                      Chart
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}