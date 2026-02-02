"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  timestamp: Date;
}

export interface PageContext {
  page: string;
  title: string;
  data?: Record<string, unknown>;
  suggestedPrompts?: string[];
}

interface AIAssistantContextType {
  // Conversation state
  messages: Message[];
  isLoading: boolean;
  error: string | null;

  // Widget state
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;

  // Page context
  pageContext: PageContext | null;
  setPageContext: (context: PageContext | null) => void;

  // Actions
  sendMessage: (message: string) => Promise<void>;
  clearConversation: () => void;
}

const AIAssistantContext = createContext<AIAssistantContextType | null>(null);

const MAX_MESSAGES = 10;

const DEFAULT_PROMPTS = [
  "What tasks do I have today?",
  "Find me some free time",
  "Show my schedule",
  "Help me plan my week",
];

export function AIAssistantProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [pageContext, setPageContext] = useState<PageContext | null>(null);

  // Keep only last MAX_MESSAGES
  const trimMessages = useCallback((msgs: Message[]) => {
    if (msgs.length > MAX_MESSAGES) {
      return msgs.slice(-MAX_MESSAGES);
    }
    return msgs;
  }, []);

  const sendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    setError(null);

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => trimMessages([...prev, userMessage]));
    setIsLoading(true);

    try {
      // Build conversation history for API (last messages)
      const conversationHistory = messages.slice(-8).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const requestBody: {
        message: string;
        conversationHistory: typeof conversationHistory;
        pageContext?: { page: string; title: string; data?: Record<string, unknown> };
      } = {
        message: messageText,
        conversationHistory,
      };

      // Only include pageContext if it exists (don't send null)
      if (pageContext) {
        requestBody.pageContext = {
          page: pageContext.page,
          title: pageContext.title,
          data: pageContext.data,
        };
      }

      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get response");
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.message,
        toolsUsed: data.toolsUsed,
        timestamp: new Date(),
      };

      setMessages((prev) => trimMessages([...prev, assistantMessage]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, pageContext, trimMessages]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  // Get suggested prompts based on page context
  const getSuggestedPrompts = (): string[] => {
    return pageContext?.suggestedPrompts || DEFAULT_PROMPTS;
  };

  return (
    <AIAssistantContext.Provider
      value={{
        messages,
        isLoading,
        error,
        isOpen,
        setIsOpen,
        pageContext,
        setPageContext,
        sendMessage,
        clearConversation,
      }}
    >
      {children}
    </AIAssistantContext.Provider>
  );
}

export function useAIAssistant() {
  const context = useContext(AIAssistantContext);
  if (!context) {
    throw new Error("useAIAssistant must be used within an AIAssistantProvider");
  }
  return context;
}

// Hook for pages to register their context
export function useRegisterPageContext(
  page: string,
  title: string,
  data?: Record<string, unknown>,
  suggestedPrompts?: string[]
) {
  const { setPageContext } = useAIAssistant();

  useEffect(() => {
    setPageContext({ page, title, data, suggestedPrompts });
    return () => setPageContext(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, title, JSON.stringify(data), JSON.stringify(suggestedPrompts), setPageContext]);
}
