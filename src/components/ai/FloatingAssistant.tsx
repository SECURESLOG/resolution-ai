"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Send,
  Loader2,
  Bot,
  User,
  Sparkles,
  X,
  Minimize2,
  Wrench,
  AlertCircle,
  MessageSquare,
  Trash2,
} from "lucide-react";
import { useAIAssistant } from "@/contexts/AIAssistantContext";

const PAGE_PROMPTS: Record<string, string[]> = {
  "/dashboard": [
    "What should I focus on today?",
    "How am I doing on my resolutions?",
    "Show my upcoming tasks",
  ],
  "/calendar": [
    "Find me a free slot tomorrow",
    "Reschedule my gym session",
    "What conflicts do I have?",
  ],
  "/weekly-plan": [
    "Explain this week's plan",
    "Why was this task assigned to me?",
    "Suggest a better time for reading",
  ],
  "/tasks": [
    "Which tasks need scheduling?",
    "Schedule all my unscheduled tasks",
    "Add a new task for meditation",
  ],
  "/insights": [
    "What patterns have you noticed?",
    "When am I most productive?",
    "How can I improve my schedule?",
  ],
};

const DEFAULT_PROMPTS = [
  "What tasks do I have today?",
  "Find me some free time",
  "Help me plan my week",
];

export function FloatingAssistant() {
  const {
    messages,
    isLoading,
    error,
    isOpen,
    setIsOpen,
    pageContext,
    sendMessage,
    clearConversation,
  } = useAIAssistant();

  const [input, setInput] = useState("");
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isMinimized]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput("");
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const suggestedPrompts = pageContext?.page
    ? PAGE_PROMPTS[pageContext.page] || DEFAULT_PROMPTS
    : DEFAULT_PROMPTS;

  // Floating button when closed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all flex items-center justify-center group"
        title="Open AI Assistant"
      >
        <Sparkles className="h-6 w-6 text-white group-hover:scale-110 transition-transform" />
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {messages.length}
          </span>
        )}
      </button>
    );
  }

  // Minimized state
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 bg-white rounded-full shadow-lg border flex items-center gap-2 px-4 py-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
          <Bot className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-medium text-gray-700">AI Assistant</span>
        <button
          onClick={() => setIsMinimized(false)}
          className="p-1 hover:bg-gray-100 rounded"
          title="Expand"
        >
          <MessageSquare className="h-4 w-4 text-gray-500" />
        </button>
        <button
          onClick={() => {
            setIsMinimized(false);
            setIsOpen(false);
          }}
          className="p-1 hover:bg-gray-100 rounded"
          title="Close"
        >
          <X className="h-4 w-4 text-gray-500" />
        </button>
      </div>
    );
  }

  // Full chat panel
  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 h-[500px] bg-white rounded-2xl shadow-2xl border flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">AI Assistant</h3>
            {pageContext && (
              <p className="text-xs text-white/70">{pageContext.title}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearConversation}
            className="p-1.5 hover:bg-white/20 rounded text-white/70 hover:text-white transition-colors"
            title="Clear conversation"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 hover:bg-white/20 rounded text-white/70 hover:text-white transition-colors"
            title="Minimize"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 hover:bg-white/20 rounded text-white/70 hover:text-white transition-colors"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Bot className="h-12 w-12 text-gray-300 mb-3" />
            <h4 className="text-sm font-medium text-gray-700 mb-1">
              How can I help?
            </h4>
            <p className="text-xs text-gray-500 mb-4">
              {pageContext
                ? `I can see you're on ${pageContext.title}. Try asking:`
                : "I can help with scheduling, tasks, and more."}
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {suggestedPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => setInput(prompt)}
                  className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-2 ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {message.role === "assistant" && (
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                <Bot className="h-3.5 w-3.5 text-white" />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 ${
                message.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              <div className="whitespace-pre-wrap text-sm">{message.content}</div>

              {message.toolsUsed && message.toolsUsed.length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-gray-200/50">
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Wrench className="h-3 w-3" />
                    <span>{message.toolsUsed.join(", ")}</span>
                  </div>
                </div>
              )}
            </div>

            {message.role === "user" && (
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                <User className="h-3.5 w-3.5 text-gray-600" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="bg-gray-100 rounded-xl px-3 py-2">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-xs">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t p-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[40px] max-h-[80px]"
            rows={1}
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            size="sm"
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl px-3 h-10"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
