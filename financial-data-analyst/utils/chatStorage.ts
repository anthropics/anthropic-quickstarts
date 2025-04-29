// utils/chatStorage.ts
import type { Message } from "@/types/chat";

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  model: string;
}

// LocalStorage key
const CHATS_STORAGE_KEY = "financial-analyst-chats";

/**
 * Saves a chat session to localStorage
 */
export const saveChat = (chat: ChatSession): void => {
  try {
    const existingChatsRaw = localStorage.getItem(CHATS_STORAGE_KEY);
    const existingChats: ChatSession[] = existingChatsRaw 
      ? JSON.parse(existingChatsRaw) 
      : [];
    
    // Update if exists, otherwise add new
    const existingIndex = existingChats.findIndex(c => c.id === chat.id);
    
    if (existingIndex >= 0) {
      existingChats[existingIndex] = chat;
    } else {
      existingChats.push(chat);
    }
    
    localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(existingChats));
  } catch (error) {
    console.error("Failed to save chat:", error);
  }
};

/**
 * Gets all saved chat sessions from localStorage
 */
export const getAllChats = (): ChatSession[] => {
  try {
    const chatsRaw = localStorage.getItem(CHATS_STORAGE_KEY);
    if (!chatsRaw) return [];
    return JSON.parse(chatsRaw);
  } catch (error) {
    console.error("Failed to retrieve chats:", error);
    return [];
  }
};

/**
 * Gets a specific chat session by ID
 */
export const getChatById = (id: string): ChatSession | null => {
  try {
    const chats = getAllChats();
    return chats.find(chat => chat.id === id) || null;
  } catch (error) {
    console.error("Failed to retrieve chat:", error);
    return null;
  }
};

/**
 * Deletes a chat session by ID
 */
export const deleteChat = (id: string): boolean => {
  try {
    const chats = getAllChats();
    const filteredChats = chats.filter(chat => chat.id !== id);
    localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(filteredChats));
    return true;
  } catch (error) {
    console.error("Failed to delete chat:", error);
    return false;
  }
};

/**
 * Creates a new empty chat session
 */
export const createNewChat = (model: string): ChatSession => {
  const newChat: ChatSession = {
    id: crypto.randomUUID(),
    title: "New Chat",
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    model
  };
  
  saveChat(newChat);
  return newChat;
};

/**
 * Updates a chat title
 */
export const updateChatTitle = (id: string, title: string): boolean => {
  try {
    const chat = getChatById(id);
    if (!chat) return false;
    
    chat.title = title;
    chat.updatedAt = new Date().toISOString();
    saveChat(chat);
    return true;
  } catch (error) {
    console.error("Failed to update chat title:", error);
    return false;
  }
};