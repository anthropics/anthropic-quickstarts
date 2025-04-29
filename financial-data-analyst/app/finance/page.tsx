// app/finance/page.tsx
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Send,
  ChevronDown,
  Paperclip,
  ChartLine,
  ChartArea,
  FileInput,
  MessageCircleQuestion,
  ChartColumnBig,
} from "lucide-react";
import FilePreview from "@/components/FilePreview";
import { ChartRenderer } from "@/components/ChartRenderer";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChartData } from "@/types/chart";
import TopNavBar from "@/components/TopNavBar";
import LeftNavBar from "@/components/LeftNavBar";
import {
  readFileAsText,
  readFileAsBase64,
  readFileAsPDFText,
} from "@/utils/fileHandling";
import type { Message, FileUpload, Model, APIResponse } from "@/types/chat";
import { 
  ChatSession,
  saveChat, 
  getAllChats, 
  getChatById, 
  createNewChat
} from "@/utils/chatStorage";

const models: Model[] = [
  { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku" },
  { id: "claude-3-5-sonnet-20240620", name: "Claude 3.5 Sonnet" },
];

interface MessageComponentProps {
  message: Message;
}

const SafeChartRenderer: React.FC<{ data: ChartData }> = ({ data }) => {
  try {
    return (
      <div className="w-full h-full p-6 flex flex-col">
        <div className="w-[90%] flex-1 mx-auto">
          <ChartRenderer data={data} />
        </div>
      </div>
    );
  } catch (error) {
    console.error("Chart rendering error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    return (
      <div className="text-red-500">Error rendering chart: {errorMessage}</div>
    );
  }
};

const MessageComponent: React.FC<MessageComponentProps> = ({ message }) => {
  return (
    <div className="flex items-start gap-2">
      {message.role === "assistant" && (
        <Avatar className="w-8 h-8 border">
          <AvatarImage src="/ant-logo.svg" alt="AI Assistant Avatar" />
          <AvatarFallback>AI</AvatarFallback>
        </Avatar>
      )}
      <div
        className={`flex flex-col max-w-[75%] ${
          message.role === "user" ? "ml-auto" : ""
        }`}
      >
        <div
          className={`p-3 rounded-md text-base ${
            message.role === "user"
              ? "bg-primary text-primary-foreground"
              : "bg-muted border"
          }`}
        >
          {message.content === "thinking" ? (
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 mr-2" />
              {message.hasToolUse ? (
                <div className="flex flex-col gap-2">
                  <Badge variant="secondary" className="inline-flex">
                    <ChartLine className="w-4 h-4 mr-1" /> Generated Chart
                  </Badge>
                  <span>Thinking...</span>
                </div>
              ) : (
                <span>Thinking...</span>
              )}
            </div>
          ) : message.role === "assistant" ? (
            <div className="flex flex-col gap-2">
              {message.hasToolUse && (
                <Badge variant="secondary" className="inline-flex px-0">
                  <ChartLine className="w-4 h-4 mr-1" /> Generated Chart
                </Badge>
              )}
              <span>{message.content}</span>
            </div>
          ) : (
            <span>{message.content}</span>
          )}
        </div>
        {message.file && (
          <div className="mt-1.5">
            <FilePreview file={message.file} size="small" />
          </div>
        )}
      </div>
    </div>
  );
};

const ChartPagination = ({
  total,
  current,
  onDotClick,
}: {
  total: number;
  current: number;
  onDotClick: (index: number) => void;
}) => (
  <div className="fixed right-12 top-1/2 -translate-y-1/2 flex flex-col gap-2">
    {Array.from({ length: total }).map((_, i) => (
      <button
        key={i}
        onClick={() => onDotClick(i)}
        className={`w-2 h-2 rounded-full transition-all ${
          i === current
            ? "bg-primary scale-125"
            : "bg-muted hover:bg-primary/50"
        }`}
      />
    ))}
  </div>
);

export default function AIChat() {
  // Chat session state
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [navbarExpanded, setNavbarExpanded] = useState(true);
  
  // Chat UI state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(
    "claude-3-5-sonnet-20240620",
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chartEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentUpload, setCurrentUpload] = useState<FileUpload | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentChartIndex, setCurrentChartIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isScrollLocked, setIsScrollLocked] = useState(false);

  // Initialize on component mount
  useEffect(() => {
    // Try to load existing chats
    const savedChats = getAllChats();
    
    if (savedChats.length > 0) {
      // Load the most recent chat
      const mostRecentChat = savedChats.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0];
      
      setCurrentChatId(mostRecentChat.id);
      setMessages(mostRecentChat.messages);
      setSelectedModel(mostRecentChat.model);
    } else {
      // Create a new chat session
      const newChat = createNewChat(selectedModel);
      setCurrentChatId(newChat.id);
    }
  }, []);
  
  // Save chat whenever messages change
  useEffect(() => {
    if (currentChatId) {
      // Get existing chat to preserve creation date
      const existingChat = getChatById(currentChatId);
      const createdAt = existingChat?.createdAt || new Date().toISOString();
      
      // Generate chat title from first user message
      const firstUserMessage = messages.find(m => m.role === "user");
      let chatTitle = "New Chat";
      
      if (firstUserMessage) {
        const content = firstUserMessage.content;
        // Get the first line for a cleaner title
        const firstLine = content.split('\n')[0].trim();
        
        // If there's a file attached, try to use that in the title
        if (firstUserMessage.file) {
          const fileName = firstUserMessage.file.fileName.split('.')[0];
          
          if (firstLine.length < 10) {
            chatTitle = `Analysis of ${fileName}`;
          } else {
            // Create a more meaningful title by taking more context (up to 40 chars)
            const preview = firstLine.substring(0, 40).trim();
            chatTitle = preview.length < firstLine.length ? `${preview}...` : preview;
          }
        } else {
          // Standard title from content
          const preview = firstLine.substring(0, 40).trim();
          chatTitle = preview.length < firstLine.length ? `${preview}...` : preview;
        }
      } else if (messages.some(m => m.chartData)) {
        // If we have charts but no user message (unlikely), use a default chart title
        chatTitle = "Chart Analysis";
      }
      
      const chatToSave: ChatSession = {
        id: currentChatId,
        title: chatTitle,
        messages,
        createdAt: createdAt,
        updatedAt: new Date().toISOString(),
        model: selectedModel
      };
      
      // Save the chat to localStorage
      saveChat(chatToSave);
      
      // Dispatch an event to notify about the update (helps with immediate UI update)
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'financial-analyst-chats'
      }));
    }
  }, [messages, currentChatId, selectedModel]);

  // Handle chat selection
  const handleSelectChat = (chatId: string) => {
    const selectedChat = getChatById(chatId);
    if (selectedChat) {
      setCurrentChatId(chatId);
      setMessages(selectedChat.messages);
      setSelectedModel(selectedChat.model);
      setCurrentUpload(null);
      setInput("");
    }
  };
  
  // Create new chat
  const handleNewChat = () => {
    // Create a new chat session
    const newChat = createNewChat(selectedModel);
    
    // Update state with the new chat
    setCurrentChatId(newChat.id);
    setMessages([]);
    setCurrentUpload(null);
    setInput("");
    
    // Force a refresh by dispatching a storage event
    // This ensures the left navbar will update immediately
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'financial-analyst-chats'
    }));
    
    // Immediately save the empty chat to ensure it appears in history
    saveChat({
      ...newChat,
      messages: [],
      updatedAt: new Date().toISOString()
    });
  };

  useEffect(() => {
    const scrollToBottom = () => {
      if (!messagesEndRef.current) return;

      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      });
    };

    // Scroll when messages change or when loading state changes
    const timeoutId = setTimeout(scrollToBottom, 100);

    return () => clearTimeout(timeoutId);
  }, [messages, isLoading]); // Add isLoading to dependencies

  useEffect(() => {
    if (!messagesEndRef.current) return;

    const observer = new ResizeObserver(() => {
      if (!isScrollLocked) {
        messagesEndRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      }
    });

    observer.observe(messagesEndRef.current);

    return () => observer.disconnect();
  }, [isScrollLocked]);

  const handleChartScroll = useCallback(() => {
    if (!contentRef.current) return;

    const { scrollTop, clientHeight } = contentRef.current;
    const newIndex = Math.round(scrollTop / clientHeight);
    setCurrentChartIndex(newIndex);
  }, []);

  const scrollToChart = (index: number) => {
    if (!contentRef.current) return;

    const targetScroll = index * contentRef.current.clientHeight;
    contentRef.current.scrollTo({
      top: targetScroll,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const scrollToNewestChart = () => {
      const chartsCount = messages.filter((m) => m.chartData).length;
      if (chartsCount > 0) {
        setCurrentChartIndex(chartsCount - 1);
        scrollToChart(chartsCount - 1);
      }
    };

    const lastChartIndex = messages.findLastIndex((m) => m.chartData);
    if (lastChartIndex !== -1) {
      setTimeout(scrollToNewestChart, 100);
    }
  }, [messages]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    // Create a ref to store the toast handlers
    let loadingToastRef: { dismiss: () => void } | undefined;

    if (file.type === "application/pdf") {
      loadingToastRef = toast({
        title: "Processing PDF",
        description: "Extracting text content...",
        duration: Infinity, // This will keep the toast until we dismiss it
      });
    }

    try {
      const isImage = file.type.startsWith("image/");
      const isPDF = file.type === "application/pdf";
      let base64Data = "";
      let isText = false;

      if (isImage) {
        base64Data = await readFileAsBase64(file);
        isText = false;
      } else if (isPDF) {
        try {
          const pdfText = await readFileAsPDFText(file);
          base64Data = btoa(encodeURIComponent(pdfText));
          isText = true;
        } catch (error) {
          console.error("Failed to parse PDF:", error);
          toast({
            title: "PDF parsing failed",
            description: "Unable to extract text from the PDF",
            variant: "destructive",
          });
          return;
        }
      } else {
        try {
          const textContent = await readFileAsText(file);
          base64Data = btoa(encodeURIComponent(textContent));
          isText = true;
        } catch (error) {
          console.error("Failed to read as text:", error);
          toast({
            title: "Invalid file type",
            description: "File must be readable as text, PDF, or be an image",
            variant: "destructive",
          });
          return;
        }
      }

      setCurrentUpload({
        base64: base64Data,
        fileName: file.name,
        mediaType: isText ? "text/plain" : file.type,
        isText,
      });

      toast({
        title: "File uploaded",
        description: `${file.name} ready to analyze`,
      });
    } catch (error) {
      console.error("Error processing file:", error);
      toast({
        title: "Upload failed",
        description: "Failed to process the file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (loadingToastRef) {
        loadingToastRef.dismiss(); // Use the dismiss method from the toast ref
        // Show success toast for PDF
        if (file.type === "application/pdf") {
          toast({
            title: "PDF Processed",
            description: "Text extracted successfully",
          });
        }
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!input.trim() && !currentUpload) return;
    if (isLoading) return;

    setIsScrollLocked(true);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
      file: currentUpload || undefined,
    };

    const thinkingMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "thinking",
    };

    // Update messages in a single state update
    setMessages((prev) => [...prev, userMessage, thinkingMessage]);
    setInput("");
    setIsLoading(true);

    // Prepare all messages for the API request
    const apiMessages = [...messages, userMessage].map((msg) => {
      if (msg.file) {
        if (msg.file.isText) {
          // For text files, decode the content before sending
          const decodedText = decodeURIComponent(atob(msg.file.base64));
          return {
            role: msg.role,
            content: `File contents of ${msg.file.fileName}:\n\n${decodedText}\n\n${msg.content}`,
          };
        } else {
          // Handle images as before
          return {
            role: msg.role,
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: msg.file.mediaType,
                  data: msg.file.base64,
                },
              },
              {
                type: "text",
                text: msg.content,
              },
            ],
          };
        }
      }
      // Handle text-only messages
      return {
        role: msg.role,
        content: msg.content,
      };
    });

    const requestBody = {
      messages: apiMessages,
      model: selectedModel,
    };

    try {
      const response = await fetch("/api/finance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: APIResponse = await response.json();

      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.content,
          hasToolUse: data.hasToolUse || !!data.toolUse,
          chartData:
            data.chartData || (data.toolUse?.input as ChartData) || null,
        };
        return newMessages;
      });

      setCurrentUpload(null);
    } catch (error) {
      console.error("Submit Error:", error);
      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "I apologize, but I encountered an error. Please try again.",
        };
        return newMessages;
      });
    } finally {
      setIsLoading(false);
      setIsScrollLocked(false);

      // Force a final scroll after state updates
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() || currentUpload) {
        const form = e.currentTarget.form;
        if (form) {
          const submitEvent = new Event("submit", {
            bubbles: true,
            cancelable: true,
          });
          form.dispatchEvent(submitEvent);
        }
      }
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = event.target;
    setInput(textarea.value);
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`;
  };

  // Handler for model change
  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    
    // If this is an existing chat, update the model
    if (currentChatId) {
      const currentChat = getChatById(currentChatId);
      if (currentChat) {
        currentChat.model = modelId;
        saveChat(currentChat);
      }
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <TopNavBar
        features={{
          showDomainSelector: false,
          showViewModeSelector: false,
          showPromptCaching: false,
        }}
      />

      <div className="flex flex-1 bg-background h-[calc(100vh-4rem)]">
        {/* Left Navigation */}
        <LeftNavBar 
          currentChatId={currentChatId}
          expanded={navbarExpanded}
          onToggleExpand={() => setNavbarExpanded(!navbarExpanded)}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          selectedModel={selectedModel}
        />
        
        {/* Main Content */}
        <div className="flex-1 flex p-4 gap-4">
          {/* Chat Area */}
          <Card className={`${navbarExpanded ? 'w-1/3' : 'w-[40%]'} flex flex-col h-full`}>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {messages.length > 0 && (
                    <>
                      <Avatar className="w-8 h-8 border">
                        <AvatarImage
                          src="/ant-logo.svg"
                          alt="AI Assistant Avatar"
                        />
                        <AvatarFallback>AI</AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-lg">
                          Financial Assistant
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Powered by Claude
                        </CardDescription>
                      </div>
                    </>
                  )}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-8 text-sm">
                      {models.find((m) => m.id === selectedModel)?.name}
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {models.map((model) => (
                      <DropdownMenuItem
                        key={model.id}
                        onSelect={() => handleModelChange(model.id)}
                      >
                        {model.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-4 scroll-smooth snap-y snap-mandatory">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full animate-fade-in-up max-w-[95%] mx-auto">
                  <Avatar className="w-10 h-10 mb-4 border">
                    <AvatarImage
                      src="/ant-logo.svg"
                      alt="AI Assistant Avatar"
                      width={40}
                      height={40}
                    />
                  </Avatar>
                  <h2 className="text-xl font-semibold mb-2">
                    Financial Assistant
                  </h2>
                  <div className="space-y-4 text-base">
                    <div className="flex items-center gap-3">
                      <ChartArea className="text-muted-foreground w-6 h-6" />
                      <p className="text-muted-foreground">
                        I can analyze financial data and create visualizations
                        from your files.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <FileInput className="text-muted-foreground w-6 h-6" />
                      <p className="text-muted-foreground">
                        Upload CSVs, PDFs, or images and I&apos;ll help you
                        understand the data.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <MessageCircleQuestion className="text-muted-foreground w-6 h-6" />
                      <p className="text-muted-foreground">
                        Ask questions about your financial data and I&apos;ll
                        create insightful charts.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 min-h-full">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`animate-fade-in-up ${
                        message.content === "thinking" ? "animate-pulse" : ""
                      }`}
                    >
                      <MessageComponent message={message} />
                    </div>
                  ))}
                  <div ref={messagesEndRef} className="h-4" />{" "}
                  {/* Add height to ensure scroll space */}
                </div>
              )}
            </CardContent>

            <CardFooter className="p-4 border-t">
              <form onSubmit={handleSubmit} className="w-full">
                <div className="flex flex-col space-y-2">
                  {currentUpload && (
                    <FilePreview
                      file={currentUpload}
                      onRemove={() => setCurrentUpload(null)}
                    />
                  )}
                  <div className="flex items-end space-x-2">
                    <div className="flex-1 relative">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading || isUploading}
                        className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8"
                      >
                        <Paperclip className="h-5 w-5" />
                      </Button>
                      <Textarea
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Type your message..."
                        disabled={isLoading}
                        className="min-h-[44px] h-[44px] resize-none pl-12 py-3 flex items-center"
                        rows={1}
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={isLoading || (!input.trim() && !currentUpload)}
                      className="h-[44px]"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </form>
            </CardFooter>
          </Card>

          {/* Visualization Area */}
          <Card className="flex-1 flex flex-col h-full overflow-hidden">
            {messages.some((m) => m.chartData) && (
              <CardHeader className="py-3 px-4 shrink-0">
                <CardTitle className="text-lg">
                  Analysis & Visualizations
                </CardTitle>
              </CardHeader>
            )}
            <CardContent
              ref={contentRef}
              className="flex-1 overflow-y-auto min-h-0 snap-y snap-mandatory"
              onScroll={handleChartScroll}
            >
              {messages.some((m) => m.chartData) ? (
                <div className="min-h-full flex flex-col">
                  {messages.map(
                    (message, index) =>
                      message.chartData && (
                        <div
                          key={`chart-${index}`}
                          className="w-full min-h-full flex-shrink-0 snap-start snap-always"
                          ref={
                            index ===
                            messages.filter((m) => m.chartData).length - 1
                              ? chartEndRef
                              : null
                          }
                        >
                          <SafeChartRenderer data={message.chartData} />
                        </div>
                      ),
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="flex flex-col items-center justify-center gap-4 -translate-y-8">
                    <ChartColumnBig className="w-8 h-8 text-muted-foreground" />
                    <div className="space-y-2">
                      <CardTitle className="text-lg">
                        Analysis & Visualizations
                      </CardTitle>
                      <CardDescription className="text-base">
                        Charts and detailed analysis will appear here as you chat
                      </CardDescription>
                      <div className="flex flex-wrap justify-center gap-2 mt-4">
                        <Badge variant="outline">Bar Charts</Badge>
                        <Badge variant="outline">Area Charts</Badge>
                        <Badge variant="outline">Linear Charts</Badge>
                        <Badge variant="outline">Pie Charts</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      {messages.some((m) => m.chartData) && (
        <ChartPagination
          total={messages.filter((m) => m.chartData).length}
          current={currentChartIndex}
          onDotClick={scrollToChart}
        />
      )}
    </div>
  );
}
