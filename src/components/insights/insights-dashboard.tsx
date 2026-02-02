"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Clock,
  Calendar,
  Zap,
  Target,
  RefreshCw,
  Loader2,
  Lightbulb,
  Award,
  BarChart3,
} from "lucide-react";

interface TimePattern {
  hour: number;
  dayOfWeek: number;
  completionRate: number;
  averageRating: number;
  sampleSize: number;
}

interface DurationPattern {
  taskType: string;
  category: string | null;
  estimatedAvg: number;
  actualAvg: number;
  accuracy: number;
  adjustmentMinutes: number;
  sampleSize: number;
}

interface CompletionPattern {
  taskType: string;
  category: string | null;
  completionRate: number;
  bestHours: number[];
  worstHours: number[];
  bestDays: number[];
  sampleSize: number;
}

interface ContextPattern {
  isTrafficSensitive: boolean;
  trafficConfidence: number;
  isWeatherSensitive: boolean;
  weatherConfidence: number;
  highEnergyHours: number[];
  lowEnergyHours: number[];
}

interface WeeklyProgress {
  weekStart: string;
  completed: number;
  total: number;
  rate: number;
}

interface InsightsData {
  patterns: {
    userId: string;
    analyzedAt: string;
    weeksCovered: number;
    totalTasksAnalyzed: number;
    timePatterns: TimePattern[];
    durationPatterns: DurationPattern[];
    completionPatterns: CompletionPattern[];
    contextPatterns: ContextPattern;
    insights: string[];
  };
  progress: {
    weeklyProgress: WeeklyProgress[];
    streak: number;
    totalCompleted: number;
    improvement: number;
  };
  fromCache: boolean;
  cacheAgeHours?: number;
}

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function InsightsDashboard() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);

      const response = await fetch(`/api/insights${refresh ? "?refresh=true" : ""}`);
      const result = await response.json();

      if (response.ok) {
        setData(result);
        setError(null);
      } else {
        setError(result.error || "Failed to fetch insights");
      }
    } catch (err) {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-gray-500">{error}</p>
          <Button onClick={() => fetchInsights()} className="mt-4">
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.patterns.totalTasksAnalyzed < 5) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            Learning Your Patterns
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">
            Complete more tasks to unlock personalized insights. We need at least 5 completed tasks
            to start identifying your patterns.
          </p>
          <div className="mt-4 text-sm text-gray-400">
            Tasks analyzed: {data?.patterns.totalTasksAnalyzed || 0} / 5
          </div>
        </CardContent>
      </Card>
    );
  }

  const { patterns, progress } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Your Insights</h2>
          <p className="text-sm text-gray-500">
            Based on {patterns.totalTasksAnalyzed} tasks over {patterns.weeksCovered} weeks
            {data.fromCache && data.cacheAgeHours !== undefined && (
              <span className="ml-2 text-gray-400">
                (updated {data.cacheAgeHours < 1 ? "recently" : `${Math.round(data.cacheAgeHours)}h ago`})
              </span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchInsights(true)}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {/* Progress Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Target className="h-5 w-5 text-blue-500" />}
          label="Completion Streak"
          value={`${progress.streak} days`}
        />
        <StatCard
          icon={<Award className="h-5 w-5 text-yellow-500" />}
          label="Tasks Completed"
          value={progress.totalCompleted.toString()}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5 text-green-500" />}
          label="Improvement"
          value={`${progress.improvement >= 0 ? "+" : ""}${progress.improvement}%`}
          positive={progress.improvement >= 0}
        />
        <StatCard
          icon={<BarChart3 className="h-5 w-5 text-purple-500" />}
          label="This Week"
          value={`${progress.weeklyProgress[progress.weeklyProgress.length - 1]?.completed || 0} tasks`}
        />
      </div>

      {/* Key Insights */}
      {patterns.insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              Key Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {patterns.insights.map((insight, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-blue-500 mt-1">•</span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Best Time Slots */}
      {patterns.timePatterns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-blue-500" />
              Your Productive Times
            </CardTitle>
            <CardDescription>When you complete tasks most successfully</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {patterns.timePatterns
                .filter((p) => p.completionRate >= 0.7)
                .slice(0, 8)
                .map((pattern, i) => (
                  <div
                    key={i}
                    className="p-3 bg-green-50 rounded-lg border border-green-100"
                  >
                    <div className="font-medium">
                      {dayNames[pattern.dayOfWeek]} {pattern.hour}:00
                    </div>
                    <div className="text-sm text-green-600">
                      {Math.round(pattern.completionRate * 100)}% success
                    </div>
                    {pattern.averageRating > 0 && (
                      <div className="text-xs text-gray-500">
                        Avg rating: {pattern.averageRating.toFixed(1)}/5
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Duration Accuracy */}
      {patterns.durationPatterns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5 text-purple-500" />
              Duration Insights
            </CardTitle>
            <CardDescription>How your time estimates compare to reality</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {patterns.durationPatterns.map((pattern, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <div className="font-medium">
                      {pattern.taskType}
                      {pattern.category && (
                        <span className="text-gray-500 ml-1">({pattern.category})</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      Estimated: {pattern.estimatedAvg}min → Actual: {pattern.actualAvg}min
                    </div>
                  </div>
                  <div
                    className={`text-sm font-medium px-2 py-1 rounded ${
                      Math.abs(pattern.adjustmentMinutes) <= 5
                        ? "bg-green-100 text-green-700"
                        : pattern.adjustmentMinutes > 0
                        ? "bg-orange-100 text-orange-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {pattern.adjustmentMinutes > 0 ? "+" : ""}
                    {pattern.adjustmentMinutes}min
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Energy Patterns */}
      {(patterns.contextPatterns.highEnergyHours.length > 0 ||
        patterns.contextPatterns.lowEnergyHours.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5 text-yellow-500" />
              Energy Patterns
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {patterns.contextPatterns.highEnergyHours.length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-500 mb-2">High Energy Hours</div>
                <div className="flex flex-wrap gap-2">
                  {patterns.contextPatterns.highEnergyHours.map((hour) => (
                    <span
                      key={hour}
                      className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm"
                    >
                      {hour}:00
                    </span>
                  ))}
                </div>
              </div>
            )}
            {patterns.contextPatterns.lowEnergyHours.length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-500 mb-2">Low Energy Hours</div>
                <div className="flex flex-wrap gap-2">
                  {patterns.contextPatterns.lowEnergyHours.map((hour) => (
                    <span
                      key={hour}
                      className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm"
                    >
                      {hour}:00
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Weekly Progress Chart */}
      {progress.weeklyProgress.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              Weekly Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between h-32 gap-2">
              {progress.weeklyProgress.map((week, i) => {
                const maxTasks = Math.max(...progress.weeklyProgress.map((w) => w.total));
                const height = maxTasks > 0 ? (week.completed / maxTasks) * 100 : 0;
                const weekDate = new Date(week.weekStart);

                return (
                  <div key={i} className="flex-1 flex flex-col items-center">
                    <div className="relative w-full flex justify-center">
                      <div
                        className="w-8 bg-blue-500 rounded-t transition-all"
                        style={{ height: `${height}%`, minHeight: week.completed > 0 ? "8px" : "0" }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      {weekDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                    <div className="text-xs font-medium">
                      {week.completed}/{week.total}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  positive,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <div className="text-sm text-gray-500">{label}</div>
            <div
              className={`text-xl font-bold ${
                positive !== undefined
                  ? positive
                    ? "text-green-600"
                    : "text-red-600"
                  : ""
              }`}
            >
              {value}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
