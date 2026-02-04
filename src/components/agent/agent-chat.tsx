"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Send,
  Loader2,
  Bot,
  User,
  Sparkles,
  Calendar,
  CheckCircle,
  AlertCircle,
  Wrench,
  Rocket,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  timestamp: Date;
}

interface OnboardingState {
  calendarConnected: boolean;
  firstTaskCreated: boolean;
  firstScheduleGenerated: boolean;
  isComplete: boolean;
  currentStep: number;
}

interface AgentChatProps {
  initialMessage?: string;
  onTaskScheduled?: () => void;
}

export function AgentChat({ initialMessage, onTaskScheduled }: AgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialMessage || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch onboarding state
  useEffect(() => {
    const fetchOnboarding = async () => {
      try {
        const response = await fetch("/api/onboarding");
        if (response.ok) {
          const data = await response.json();
          setOnboarding(data);
        }
      } catch (error) {
        console.error("Failed to fetch onboarding:", error);
      }
    };
    fetchOnboarding();
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Send initial message if provided
  useEffect(() => {
    if (initialMessage && messages.length === 0) {
      handleSend(initialMessage);
    }
  }, [initialMessage]);

  const handleSend = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) return;

    setError(null);
    setInput("");

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Build conversation history for API
      const conversationHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationHistory,
        }),
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

      setMessages((prev) => [...prev, assistantMessage]);

      // If a task was scheduled, notify parent
      if (data.toolsUsed?.includes("create_scheduled_task")) {
        onTaskScheduled?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Different prompts based on onboarding state
  const getWelcomeContent = () => {
    if (!onboarding || onboarding.isComplete) {
      return {
        title: "How can I help you today?",
        subtitle:
          "I can help you schedule tasks, find free time, check your calendar, and make sure chores are fairly distributed.",
        prompts: [
          "Schedule gym for tomorrow morning",
          "What tasks do I have this week?",
          "Find time for grocery shopping",
          "Is the task distribution fair?",
          "Show me my free time slots today",
        ],
      };
    }

    // New user - not yet created a task
    if (!onboarding.firstTaskCreated) {
      return {
        title: "Welcome! I'm your AI scheduling assistant",
        subtitle:
          "I see you've connected your calendar. Let's add your first goal! Just tell me what you want to achieve, and I'll find the perfect time for it.",
        prompts: [
          "I want to exercise 3 times this week",
          "Help me find time to read every day",
          "Schedule meal prep for Sunday",
          "I need to practice guitar for 30 minutes daily",
        ],
        isOnboarding: true,
      };
    }

    // Has tasks but no schedule generated
    if (!onboarding.firstScheduleGenerated) {
      return {
        title: "Great! You've added tasks",
        subtitle:
          "Now let's find the perfect time slots. I'll look at your calendar and suggest optimal times based on your schedule.",
        prompts: [
          "Generate my schedule for this week",
          "When's the best time for my tasks?",
          "Schedule all my pending tasks",
          "Find free time in my calendar",
        ],
        isOnboarding: true,
      };
    }

    // Default
    return {
      title: "How can I help you today?",
      subtitle:
        "I can help you schedule tasks, find free time, check your calendar, and make sure chores are fairly distributed.",
      prompts: [
        "Schedule gym for tomorrow morning",
        "What tasks do I have this week?",
        "Find time for grocery shopping",
        "Show me my free time slots today",
      ],
    };
  };

  const welcomeContent = getWelcomeContent();

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          Family AI Assistant
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              {welcomeContent.isOnboarding ? (
                <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center mb-4">
                  <Rocket className="h-8 w-8 text-white" />
                </div>
              ) : (
                <Bot className="h-16 w-16 text-gray-300 mb-4" />
              )}
              <h3 className="text-lg font-medium text-gray-700 mb-2">
                {welcomeContent.title}
              </h3>
              <p className="text-sm text-gray-500 mb-6 max-w-md">
                {welcomeContent.subtitle}
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {welcomeContent.prompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(prompt)}
                    className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                      welcomeContent.isOnboarding
                        ? "bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-200"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                    }`}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              {welcomeContent.isOnboarding && (
                <p className="text-xs text-gray-400 mt-4">
                  Tip: Just type naturally - I understand plain English!
                </p>
              )}
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "assistant" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
              )}

              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  message.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                <div className="whitespace-pre-wrap text-sm">
                  {message.content}
                </div>

                {message.toolsUsed && message.toolsUsed.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-200/50">
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Wrench className="h-3 w-3" />
                      <span>Used: {message.toolsUsed.join(", ")}</span>
                    </div>
                  </div>
                )}
              </div>

              {message.role === "user" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                  <User className="h-5 w-5 text-gray-600" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div className="bg-gray-100 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t p-4">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me to schedule tasks, find free time, or check your calendar..."
              className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[48px] max-h-[120px]"
              rows={1}
              disabled={isLoading}
            />
            <Button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl px-4"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
