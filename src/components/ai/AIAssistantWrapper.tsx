"use client";

import { AIAssistantProvider } from "@/contexts/AIAssistantContext";
import { FloatingAssistant } from "./FloatingAssistant";

export function AIAssistantWrapper({ children }: { children: React.ReactNode }) {
  return (
    <AIAssistantProvider>
      {children}
      <FloatingAssistant />
    </AIAssistantProvider>
  );
}
