"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, RefreshCw, Loader2, Info, X } from "lucide-react";

function InfoButton({ info }: { info: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 rounded-full hover:bg-white/50 transition-colors"
        aria-label="More information"
      >
        <Info className="h-3.5 w-3.5 text-purple-400 hover:text-purple-600" />
      </button>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 top-8 z-50 w-72 p-3 bg-white rounded-lg shadow-lg border border-gray-200">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-gray-600">{info}</p>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-0.5 rounded hover:bg-gray-100"
              >
                <X className="h-3 w-3 text-gray-400" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface InsightData {
  insight: string;
  stats: {
    todayCompleted: number;
    todayTotal: number;
    weekCompleted: number;
    weekTotal: number;
    streakDays: number;
    completionRate: number;
  };
  generatedAt: string;
}

export function DailyInsight() {
  const [data, setData] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchInsight(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch("/api/insights/daily");
      if (res.ok) {
        setData(await res.json());
      }
    } catch (error) {
      console.error("Error fetching insight:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchInsight();
  }, []);

  if (loading) {
    return (
      <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center">
              <Loader2 className="h-5 w-5 text-white animate-spin" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500">Generating your daily insight...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <p className="text-xs font-medium text-purple-600 uppercase tracking-wide">
                  AI Daily Insight
                </p>
                <InfoButton info="AI-generated personalized insight based on your schedule, completion patterns, and preferences. Refreshes daily to give you relevant motivation and tips." />
              </div>
              <button
                onClick={() => fetchInsight(true)}
                disabled={refreshing}
                className="p-1 text-gray-400 hover:text-purple-600 transition-colors"
                title="Refresh insight"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                />
              </button>
            </div>
            <p className="text-gray-700 text-sm leading-relaxed">{data.insight}</p>

            {/* Quick stats row */}
            {data.stats.streakDays > 0 && (
              <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="text-orange-500">🔥</span>
                  {data.stats.streakDays} day streak
                </span>
                <span>•</span>
                <span>{data.stats.completionRate}% this week</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
