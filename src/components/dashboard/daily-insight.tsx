"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";

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
              <p className="text-xs font-medium text-purple-600 uppercase tracking-wide">
                AI Daily Insight
              </p>
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
