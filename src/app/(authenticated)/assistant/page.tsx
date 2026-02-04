"use client";

import { AgentChat } from "@/components/agent/agent-chat";
import { useRouter } from "next/navigation";

export default function AssistantPage() {
  const router = useRouter();

  const handleTaskScheduled = () => {
    // Could trigger a refresh of calendar or dashboard
    // For now, just a simple callback
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">AI Assistant</h1>
        <p className="text-gray-600 mt-1">
          Chat with your family scheduling assistant to manage tasks, find free time, and optimize your schedule.
        </p>
      </div>

      <div className="max-w-3xl mx-auto">
        <AgentChat onTaskScheduled={handleTaskScheduled} />
      </div>

      {/* Quick Actions */}
      <div className="max-w-3xl mx-auto">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickAction
            label="Schedule"
            onClick={() => router.push("/schedule")}
          />
          <QuickAction
            label="Home"
            onClick={() => router.push("/dashboard")}
          />
          <QuickAction
            label="Your AI"
            onClick={() => router.push("/opik-insights")}
          />
          <QuickAction
            label="Settings"
            onClick={() => router.push("/settings")}
          />
        </div>
      </div>
    </div>
  );
}

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-3 text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-center"
    >
      {label}
    </button>
  );
}
