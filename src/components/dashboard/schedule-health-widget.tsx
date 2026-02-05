"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle,
  TrendingDown,
  TrendingUp,
  Calendar,
  Lightbulb,
  Info,
  X,
} from "lucide-react";

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
        <Info className="h-4 w-4 text-gray-400 hover:text-gray-600" />
      </button>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-8 z-50 w-72 p-3 bg-white rounded-lg shadow-lg border border-gray-200">
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

interface ScheduleHealth {
  overlapsThisWeek: number;
  overlapsLastWeek: number;
  skippedTasksThisWeek: number;
  completedTasksThisWeek: number;
  overlappedAndSkipped: number;
  impactPercentage: number;
  insight: string;
  severity: "low" | "medium" | "high";
}

export function ScheduleHealthWidget() {
  const [health, setHealth] = useState<ScheduleHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHealth();
  }, []);

  async function fetchHealth() {
    try {
      const response = await fetch("/api/schedule/health");
      if (response.ok) {
        setHealth(await response.json());
      }
    } catch (error) {
      console.error("Error fetching schedule health:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 rounded w-1/3"></div>
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!health) return null;

  const severityColors = {
    low: "text-green-600 bg-green-50 border-green-200",
    medium: "text-yellow-600 bg-yellow-50 border-yellow-200",
    high: "text-red-600 bg-red-50 border-red-200",
  };

  const severityIcons = {
    low: <CheckCircle className="h-5 w-5 text-green-600" />,
    medium: <AlertTriangle className="h-5 w-5 text-yellow-600" />,
    high: <AlertTriangle className="h-5 w-5 text-red-600" />,
  };

  const trend = health.overlapsThisWeek - health.overlapsLastWeek;

  return (
    <Card className={`border ${severityColors[health.severity]}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {severityIcons[health.severity]}
          Balance Check
          <InfoButton info="Monitors your schedule for overcommitments and burnout risk. Tracks calendar conflicts, skipped tasks, and provides AI-powered recommendations to maintain a sustainable workload." />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Stats */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-bold">{health.overlapsThisWeek}</p>
            <p className="text-sm text-gray-600">overcommitments</p>
          </div>
          {health.overlapsLastWeek > 0 && (
            <div className={`flex items-center gap-1 text-sm ${
              trend < 0 ? "text-green-600" : trend > 0 ? "text-red-600" : "text-gray-500"
            }`}>
              {trend < 0 ? (
                <TrendingDown className="h-4 w-4" />
              ) : trend > 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : null}
              {trend !== 0 && (
                <span>{Math.abs(trend)} vs last week</span>
              )}
            </div>
          )}
        </div>

        {/* Impact */}
        {health.skippedTasksThisWeek > 0 && (
          <div className="p-2 bg-white/50 rounded text-sm">
            <span className="text-gray-600">Burnout risk: </span>
            <span className="font-medium">
              {health.overlappedAndSkipped} thing{health.overlappedAndSkipped !== 1 ? 's' : ''} dropped
            </span>
            {health.impactPercentage > 0 && (
              <span className="text-gray-500"> ({health.impactPercentage}% of planned)</span>
            )}
          </div>
        )}

        {/* AI Insight */}
        <div className="flex gap-2 p-3 bg-white rounded-lg border">
          <Lightbulb className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-700">{health.insight}</p>
        </div>

        {/* Actions */}
        {health.overlapsThisWeek > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" asChild>
              <a href="/schedule">
                <Calendar className="h-4 w-4 mr-1" />
                Rebalance
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
