"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface DayProgress {
  day: string;
  date: string;
  scheduled: number;
  completed: number;
  isToday: boolean;
}

interface WeeklyProgressProps {
  data: DayProgress[];
  completionRate: number;
}

export function WeeklyProgress({ data, completionRate }: WeeklyProgressProps) {
  // Calculate trend (compare this week's rate to last week estimate)
  const getTrendIcon = () => {
    if (completionRate >= 75) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (completionRate >= 50) return <Minus className="h-4 w-4 text-yellow-600" />;
    return <TrendingDown className="h-4 w-4 text-red-600" />;
  };

  const getTrendColor = () => {
    if (completionRate >= 75) return "text-green-600";
    if (completionRate >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const maxTasks = Math.max(...data.map((d) => d.scheduled), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Weekly Progress</CardTitle>
            <CardDescription>Your task completion this week</CardDescription>
          </div>
          <div className={`flex items-center gap-1 ${getTrendColor()}`}>
            {getTrendIcon()}
            <span className="text-lg font-bold">{completionRate}%</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-2 h-32">
          {data.map((day) => {
            const height = day.scheduled > 0 ? (day.scheduled / maxTasks) * 100 : 10;
            const completedHeight = day.scheduled > 0 ? (day.completed / day.scheduled) * height : 0;
            const rate = day.scheduled > 0 ? Math.round((day.completed / day.scheduled) * 100) : 0;

            return (
              <div key={day.day} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full relative rounded-t-sm overflow-hidden"
                  style={{ height: `${height}%`, minHeight: "8px" }}
                >
                  {/* Background (scheduled) */}
                  <div
                    className={`absolute inset-0 ${
                      day.isToday ? "bg-blue-200" : "bg-gray-200"
                    }`}
                  />
                  {/* Completed overlay */}
                  <div
                    className={`absolute bottom-0 left-0 right-0 transition-all ${
                      day.isToday ? "bg-blue-600" : "bg-green-500"
                    }`}
                    style={{ height: `${(completedHeight / height) * 100}%` }}
                  />
                </div>
                <div className="text-center">
                  <p
                    className={`text-xs font-medium ${
                      day.isToday ? "text-blue-600" : "text-gray-600"
                    }`}
                  >
                    {day.day}
                  </p>
                  {day.scheduled > 0 && (
                    <p className="text-[10px] text-gray-400">
                      {day.completed}/{day.scheduled}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-gray-200 rounded-sm" />
            <span>Scheduled</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded-sm" />
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-600 rounded-sm" />
            <span>Today</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
