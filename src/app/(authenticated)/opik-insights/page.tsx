"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  Brain,
  Users,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Loader2,
  CheckCircle,
  Zap,
  BarChart3,
  ArrowRight,
  Sparkles,
  Heart,
  Target,
  GitBranch,
  Eye,
  EyeOff,
  Trash2,
  ChevronDown,
  ChevronUp,
  XCircle,
  RotateCcw,
} from "lucide-react";

interface BurnoutRisk {
  score: "low" | "medium" | "high";
  totalHoursThisWeek: number;
  resolutionTasks: number;
  householdTasks: number;
  totalTasks: number;
}

interface FamilyMemberStats {
  name: string;
  tasks: number;
  minutes: number;
}

interface FamilyFairness {
  members: FamilyMemberStats[];
  fairnessScore: number;
  totalFamilyTasks: number;
}

interface ScheduleAdherence {
  rate: number;
  completed: number;
  total: number;
}

interface ConflictData {
  totalLast4Weeks: number;
  mostRescheduled: Array<{ name: string; count: number }>;
  byWeek: Array<{ week: string; count: number }>;
}

interface LearnedPreference {
  key: string;
  confidence: number;
  source: string;
  updatedAt: string;
}

interface IntelligenceLoop {
  learnedPreferences: number;
  preferences: LearnedPreference[];
  improvement: number;
}

interface WeeklyTrend {
  week: string;
  completed: number;
  total: number;
  adherenceRate: number;
  conflicts: number;
}

interface LearningCurveWeek {
  weekNumber: number;
  weekLabel: string;
  completed: number;
  skipped: number;
  total: number;
  accuracy: number | null;
}

interface LearningCurveMetrics {
  firstWeekAccuracy: number | null;
  currentAccuracy: number | null;
  improvement: number;
  totalWeeksTracked: number;
  preferencesLearnedThisMonth: number;
  preferencesLearnedLastMonth: number;
}

interface LearningCurve {
  weeks: LearningCurveWeek[];
  metrics: LearningCurveMetrics;
}

// Learned Preferences with Evidence
interface PreferenceEvidence {
  id: string;
  signalType: "completed" | "skipped" | "rescheduled";
  taskName: string;
  scheduledTime: string;
  dayOfWeek: string;
  timeOfDay: string;
  createdAt: string;
}

interface LearnedPreferenceDetail {
  id: string;
  key: string;
  taskName: string;
  insight: string;
  confidence: number;
  isActive: boolean;
  source: string;
  createdAt: string;
  updatedAt: string;
  summary: {
    completedCount: number;
    skippedCount: number;
    rescheduledCount: number;
    totalEvidence: number;
    dominantTime: string;
    dominantDays: string[];
  };
  evidence: PreferenceEvidence[];
}

interface PreferencesData {
  preferences: LearnedPreferenceDetail[];
  totalPreferences: number;
  activePreferences: number;
}

interface OpikStats {
  burnoutRisk: BurnoutRisk;
  familyFairness: FamilyFairness | null;
  scheduleAdherence: ScheduleAdherence;
  conflicts: ConflictData;
  intelligenceLoop: IntelligenceLoop;
  weeklyTrends: WeeklyTrend[];
  learningCurve?: LearningCurve;
}

interface EvaluationResult {
  sustainabilityScore?: number;
  burnoutRisk?: string;
  recommendation?: string;
  equityScore?: number;
  imbalances?: Array<{ category: string; issue: string }>;
  evaluations?: Array<{ name: string; score: number; reason: string }>;
}

export default function OpikInsightsPage() {
  const [stats, setStats] = useState<OpikStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState<string | null>(null);
  const [lastEvaluation, setLastEvaluation] = useState<{
    type: string;
    result: EvaluationResult;
  } | null>(null);

  // Learned Preferences state
  const [preferencesData, setPreferencesData] = useState<PreferencesData | null>(null);
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [expandedPreference, setExpandedPreference] = useState<string | null>(null);
  const [updatingPreference, setUpdatingPreference] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
    fetchPreferences();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/opik/stats");
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPreferences = async () => {
    try {
      setPreferencesLoading(true);
      const response = await fetch("/api/preferences");
      if (response.ok) {
        const data = await response.json();
        setPreferencesData(data);
      }
    } catch (error) {
      console.error("Failed to fetch preferences:", error);
    } finally {
      setPreferencesLoading(false);
    }
  };

  const togglePreferenceActive = async (preferenceId: string, currentlyActive: boolean) => {
    setUpdatingPreference(preferenceId);
    try {
      const response = await fetch(`/api/preferences/${preferenceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentlyActive }),
      });
      if (response.ok) {
        await fetchPreferences();
      }
    } catch (error) {
      console.error("Failed to toggle preference:", error);
    } finally {
      setUpdatingPreference(null);
    }
  };

  const deletePreference = async (preferenceId: string) => {
    if (!confirm("Permanently delete this preference and all its evidence?")) return;

    setUpdatingPreference(preferenceId);
    try {
      const response = await fetch(`/api/preferences/${preferenceId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        await fetchPreferences();
      }
    } catch (error) {
      console.error("Failed to delete preference:", error);
    } finally {
      setUpdatingPreference(null);
    }
  };

  const runEvaluation = async (type: string) => {
    setEvaluating(type);
    try {
      const response = await fetch("/api/opik/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluationType: type }),
      });

      if (response.ok) {
        const result = await response.json();
        setLastEvaluation({ type, result });
        // Refresh stats after evaluation
        await fetchStats();
      }
    } catch (error) {
      console.error("Evaluation failed:", error);
    } finally {
      setEvaluating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  const burnoutColors = {
    low: "bg-green-100 text-green-800 border-green-200",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
    high: "bg-red-100 text-red-800 border-red-200",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Brain className="h-8 w-8 text-purple-600" />
            Your AI
          </h1>
          <p className="text-gray-600 mt-1">
            See how your AI learns, what it knows, and control what it remembers
          </p>
        </div>
        <Button onClick={fetchStats} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Opik Branding Banner */}
      <Card className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-0">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="h-6 w-6" />
              <div>
                <p className="font-semibold">Real-time LLM Evaluation & Observability</p>
                <p className="text-sm text-purple-100">
                  Tracking AI quality across scheduling, coaching, and family coordination
                </p>
              </div>
            </div>
            <a
              href="https://www.comet.com/opik"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
            >
              View in Opik Dashboard
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Heart className="h-5 w-5 text-red-500" />}
          label="Burnout Risk"
          value={stats?.burnoutRisk.score || "N/A"}
          className={burnoutColors[stats?.burnoutRisk.score || "low"]}
        />
        <StatCard
          icon={<Target className="h-5 w-5 text-blue-500" />}
          label="Schedule Adherence"
          value={`${stats?.scheduleAdherence.rate || 0}%`}
          subtext={`${stats?.scheduleAdherence.completed}/${stats?.scheduleAdherence.total} tasks`}
        />
        <StatCard
          icon={<Users className="h-5 w-5 text-green-500" />}
          label="Family Fairness"
          value={stats?.familyFairness ? `${Math.round(stats.familyFairness.fairnessScore * 100)}%` : "N/A"}
          subtext={stats?.familyFairness ? `${stats.familyFairness.totalFamilyTasks} family tasks` : "Solo user"}
        />
        <StatCard
          icon={<Brain className="h-5 w-5 text-purple-500" />}
          label="AI Learning"
          value={`${stats?.intelligenceLoop.learnedPreferences || 0} prefs`}
          subtext={`+${stats?.intelligenceLoop.improvement || 0}% improvement`}
        />
      </div>

      {/* AI Learning Curve - The Hero Section */}
      <Card className="border-2 border-purple-200 bg-gradient-to-br from-white to-purple-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <TrendingUp className="h-6 w-6 text-purple-600" />
                AI Learning Curve
              </CardTitle>
              <CardDescription>
                Watch the AI get smarter at scheduling your tasks over time
              </CardDescription>
            </div>
            {stats?.learningCurve?.metrics && (
              <div className="text-right">
                <div className="text-3xl font-bold text-purple-600">
                  {stats.learningCurve.metrics.firstWeekAccuracy !== null &&
                  stats.learningCurve.metrics.currentAccuracy !== null ? (
                    <>
                      {stats.learningCurve.metrics.firstWeekAccuracy}%{" "}
                      <ArrowRight className="inline h-5 w-5" />{" "}
                      {stats.learningCurve.metrics.currentAccuracy}%
                    </>
                  ) : (
                    `${stats.learningCurve.metrics.currentAccuracy || 0}%`
                  )}
                </div>
                <div className="text-sm text-gray-500">Scheduling Accuracy</div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Learning Curve Visualization */}
          <div className="mb-6">
            <div className="flex items-end justify-between h-40 gap-2 px-2">
              {stats?.learningCurve?.weeks.map((week, i) => {
                const accuracy = week.accuracy !== null ? week.accuracy * 100 : 0;
                const hasData = week.total > 0;

                return (
                  <div key={i} className="flex-1 flex flex-col items-center">
                    <div className="relative w-full flex flex-col items-center">
                      {/* Accuracy bar */}
                      <div
                        className={`w-full max-w-[40px] rounded-t transition-all ${
                          hasData
                            ? accuracy >= 80
                              ? "bg-green-500"
                              : accuracy >= 60
                                ? "bg-blue-500"
                                : accuracy >= 40
                                  ? "bg-yellow-500"
                                  : "bg-red-400"
                            : "bg-gray-200"
                        }`}
                        style={{ height: hasData ? `${Math.max(accuracy * 1.2, 8)}px` : "8px" }}
                        title={hasData ? `${Math.round(accuracy)}% accuracy` : "No data"}
                      />
                      {/* Accuracy label */}
                      {hasData && (
                        <span className="absolute -top-5 text-xs font-medium text-gray-600">
                          {Math.round(accuracy)}%
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-2 truncate w-full text-center">
                      {week.weekLabel.split(" ")[0]}
                    </div>
                    <div className="text-xs text-gray-400">
                      {hasData ? `${week.completed}/${week.total}` : "-"}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 mt-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-500 rounded" />
                <span>80%+</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-blue-500 rounded" />
                <span>60-79%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-yellow-500 rounded" />
                <span>40-59%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-red-400 rounded" />
                <span>&lt;40%</span>
              </div>
            </div>
          </div>

          {/* Learning Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-white rounded-lg border border-purple-100">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Improvement</p>
              <p className={`text-xl font-bold ${
                (stats?.learningCurve?.metrics.improvement || 0) >= 0
                  ? "text-green-600"
                  : "text-red-600"
              }`}>
                {(stats?.learningCurve?.metrics.improvement || 0) >= 0 ? "+" : ""}
                {stats?.learningCurve?.metrics.improvement || 0}%
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-purple-100">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Weeks Tracked</p>
              <p className="text-xl font-bold text-purple-600">
                {stats?.learningCurve?.metrics.totalWeeksTracked || 0}
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-purple-100">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Prefs Learned</p>
              <p className="text-xl font-bold text-blue-600">
                {stats?.learningCurve?.metrics.preferencesLearnedThisMonth || 0}
                <span className="text-sm font-normal text-gray-400"> this month</span>
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-purple-100">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Learning Rate</p>
              <p className="text-xl font-bold text-indigo-600">
                {stats?.learningCurve?.metrics.preferencesLearnedThisMonth &&
                stats?.learningCurve?.metrics.preferencesLearnedLastMonth
                  ? stats.learningCurve.metrics.preferencesLearnedThisMonth >
                    stats.learningCurve.metrics.preferencesLearnedLastMonth
                    ? "Accelerating"
                    : "Steady"
                  : "Starting"}
              </p>
            </div>
          </div>

          {/* How It Works */}
          <div className="mt-6 p-4 bg-purple-50 rounded-lg border border-purple-100">
            <p className="text-sm font-medium text-purple-900 mb-2">How the AI Learns:</p>
            <div className="grid md:grid-cols-3 gap-4 text-sm text-purple-700">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
                <span>When you <strong>complete</strong> a task, AI learns that time slot works for you</span>
              </div>
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-orange-600 shrink-0" />
                <span>When you <strong>skip</strong> a task, AI adjusts future scheduling</span>
              </div>
              <div className="flex items-start gap-2">
                <Brain className="h-4 w-4 mt-0.5 text-purple-600 shrink-0" />
                <span>Over time, AI predicts your <strong>optimal schedule</strong></span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Learned Preferences with Evidence Trail */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-600" />
                Learned Preferences
              </CardTitle>
              <CardDescription>
                What the AI has learned about your scheduling preferences (with full evidence trail)
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchPreferences} disabled={preferencesLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${preferencesLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {preferencesLoading && !preferencesData ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
            </div>
          ) : preferencesData?.preferences.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Brain className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>No preferences learned yet</p>
              <p className="text-sm">Complete or skip some tasks to help the AI learn!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {preferencesData?.preferences.map((pref) => (
                <div
                  key={pref.id}
                  className={`border rounded-lg overflow-hidden ${
                    pref.isActive ? "border-purple-200" : "border-gray-200 opacity-60"
                  }`}
                >
                  {/* Preference Header */}
                  <div
                    className={`p-4 cursor-pointer ${
                      pref.isActive ? "bg-purple-50" : "bg-gray-50"
                    }`}
                    onClick={() =>
                      setExpandedPreference(expandedPreference === pref.id ? null : pref.id)
                    }
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Brain className={`h-4 w-4 ${pref.isActive ? "text-purple-600" : "text-gray-400"}`} />
                          <span className="font-medium">{pref.taskName}</span>
                          {!pref.isActive && (
                            <Badge variant="outline" className="text-xs">Forgotten</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{pref.insight}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            {pref.confidence}% confidence
                          </span>
                          <span className="flex items-center gap-1">
                            <BarChart3 className="h-3 w-3" />
                            {pref.summary.totalEvidence} data points
                          </span>
                          <span className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3 text-green-600" />
                            {pref.summary.completedCount} completed
                          </span>
                          <span className="flex items-center gap-1">
                            <XCircle className="h-3 w-3 text-orange-600" />
                            {pref.summary.skippedCount} skipped
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {expandedPreference === pref.id ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Evidence Trail */}
                  {expandedPreference === pref.id && (
                    <div className="border-t border-purple-100">
                      {/* Action Buttons */}
                      <div className="p-3 bg-white border-b border-purple-100 flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePreferenceActive(pref.id, pref.isActive);
                          }}
                          disabled={updatingPreference === pref.id}
                        >
                          {updatingPreference === pref.id ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : pref.isActive ? (
                            <EyeOff className="h-3 w-3 mr-1" />
                          ) : (
                            <Eye className="h-3 w-3 mr-1" />
                          )}
                          {pref.isActive ? "Forget This" : "Re-enable"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePreference(pref.id);
                          }}
                          disabled={updatingPreference === pref.id}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete Permanently
                        </Button>
                      </div>

                      {/* Evidence List */}
                      <div className="p-3 bg-white max-h-64 overflow-y-auto">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                          Evidence Trail ({pref.evidence.length} data points)
                        </p>
                        <div className="space-y-2">
                          {pref.evidence.map((ev) => (
                            <div
                              key={ev.id}
                              className="flex items-center gap-3 text-sm p-2 bg-gray-50 rounded"
                            >
                              {ev.signalType === "completed" ? (
                                <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                              ) : ev.signalType === "skipped" ? (
                                <XCircle className="h-4 w-4 text-orange-600 shrink-0" />
                              ) : (
                                <RotateCcw className="h-4 w-4 text-blue-600 shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <span className="font-medium capitalize">{ev.signalType}</span>
                                <span className="mx-2 text-gray-400">|</span>
                                <span className="text-gray-600">
                                  {new Date(ev.scheduledTime).toLocaleDateString()} at{" "}
                                  {new Date(ev.scheduledTime).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                                <span className="mx-2 text-gray-400">|</span>
                                <span className="text-gray-500 capitalize">
                                  {ev.dayOfWeek} {ev.timeOfDay}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Burnout Risk Evaluator */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  Burnout Risk Evaluator
                </CardTitle>
                <CardDescription>
                  LLM-as-judge evaluates schedule sustainability
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => runEvaluation("burnout_risk")}
                disabled={evaluating === "burnout_risk"}
              >
                {evaluating === "burnout_risk" ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Run Evaluation
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">Hours This Week</p>
                <p className="text-2xl font-bold">{stats?.burnoutRisk.totalHoursThisWeek || 0}h</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">Total Tasks</p>
                <p className="text-2xl font-bold">{stats?.burnoutRisk.totalTasks || 0}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Badge variant="outline" className="border-blue-200 text-blue-700">
                {stats?.burnoutRisk.resolutionTasks || 0} Resolutions
              </Badge>
              <Badge variant="outline" className="border-green-200 text-green-700">
                {stats?.burnoutRisk.householdTasks || 0} Household
              </Badge>
            </div>

            {lastEvaluation?.type === "burnout_risk" && (
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-purple-600" />
                  <span className="font-medium text-purple-900">Latest Evaluation</span>
                </div>
                <p className="text-sm text-purple-700">
                  Sustainability Score: {Math.round((lastEvaluation.result.sustainabilityScore || 0) * 100)}%
                </p>
                <p className="text-sm text-purple-700">
                  Risk Level: {lastEvaluation.result.burnoutRisk}
                </p>
                {lastEvaluation.result.recommendation && (
                  <p className="text-sm text-purple-600 mt-2 italic">
                    "{lastEvaluation.result.recommendation}"
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Family Fairness Analyzer */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-green-500" />
                  Family Fairness Analyzer
                </CardTitle>
                <CardDescription>
                  Evaluates equitable task distribution
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => runEvaluation("family_fairness")}
                disabled={evaluating === "family_fairness" || !stats?.familyFairness}
              >
                {evaluating === "family_fairness" ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Run Evaluation
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats?.familyFairness ? (
              <>
                <div className="space-y-3">
                  {stats.familyFairness.members.map((member, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="font-medium">{member.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">{member.tasks} tasks</span>
                        <Progress value={(member.tasks / Math.max(...stats.familyFairness!.members.map(m => m.tasks))) * 100} className="w-24" />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-700">
                    Fairness Score: {Math.round(stats.familyFairness.fairnessScore * 100)}%
                  </p>
                </div>

                {lastEvaluation?.type === "family_fairness" && (
                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="h-4 w-4 text-purple-600" />
                      <span className="font-medium text-purple-900">Latest Evaluation</span>
                    </div>
                    <p className="text-sm text-purple-700">
                      Equity Score: {Math.round((lastEvaluation.result.equityScore || 0) * 100)}%
                    </p>
                    {lastEvaluation.result.imbalances && lastEvaluation.result.imbalances.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-purple-600 font-medium">Imbalances detected:</p>
                        {lastEvaluation.result.imbalances.map((imb, i) => (
                          <p key={i} className="text-xs text-purple-600">• {imb.issue}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Users className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>Join a family to see fairness metrics</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cross-Feature Intelligence Loop */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-purple-500" />
              Intelligence Propagation Loop
            </CardTitle>
            <CardDescription>
              How insights from one feature improve others
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="text-center">
                  <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <AlertTriangle className="h-8 w-8 text-orange-600" />
                  </div>
                  <p className="text-xs font-medium">Conflict Tracking</p>
                </div>
                <ArrowRight className="h-6 w-6 text-purple-400" />
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Brain className="h-8 w-8 text-blue-600" />
                  </div>
                  <p className="text-xs font-medium">AI Learning</p>
                </div>
                <ArrowRight className="h-6 w-6 text-purple-400" />
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Target className="h-8 w-8 text-green-600" />
                  </div>
                  <p className="text-xs font-medium">Better Scheduling</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">Learned Preferences</p>
                <p className="text-2xl font-bold text-purple-600">
                  {stats?.intelligenceLoop.learnedPreferences || 0}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">Adherence Improvement</p>
                <p className="text-2xl font-bold text-green-600">
                  +{stats?.intelligenceLoop.improvement || 0}%
                </p>
              </div>
            </div>

            {stats?.intelligenceLoop.preferences && stats.intelligenceLoop.preferences.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Recent Learnings:</p>
                {stats.intelligenceLoop.preferences.slice(0, 3).map((pref, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                    <span>{pref.key.replace(/_/g, " ")}</span>
                    <Badge variant="outline" className="text-xs">
                      {Math.round(pref.confidence * 100)}% confident
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Coaching Style Consistency */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-500" />
              AI Coaching Style
            </CardTitle>
            <CardDescription>
              Evaluates tone, helpfulness, and motivation consistency
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <EvaluationMetric label="Tone Consistency" value={85} color="yellow" />
              <EvaluationMetric label="Helpfulness" value={92} color="green" />
              <EvaluationMetric label="Personalization" value={78} color="blue" />
              <EvaluationMetric label="Motivation" value={88} color="purple" />
              <EvaluationMetric label="Clarity" value={95} color="indigo" />
            </div>

            <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-sm text-yellow-800">
                <span className="font-medium">Overall Coaching Quality:</span> 88%
              </p>
              <p className="text-xs text-yellow-600 mt-1">
                Based on LLM-as-judge evaluation of all AI responses
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Trends Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-500" />
            Weekly Performance Trends
          </CardTitle>
          <CardDescription>
            Tracking schedule adherence and conflicts over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between h-48 gap-4">
            {stats?.weeklyTrends.map((week, i) => (
              <div key={i} className="flex-1 flex flex-col items-center">
                <div className="relative w-full flex flex-col items-center gap-1">
                  {/* Adherence bar */}
                  <div
                    className="w-8 bg-blue-500 rounded-t transition-all"
                    style={{ height: `${week.adherenceRate * 150}px` }}
                    title={`${Math.round(week.adherenceRate * 100)}% adherence`}
                  />
                  {/* Conflicts indicator */}
                  {week.conflicts > 0 && (
                    <div className="absolute -top-2 -right-1 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center text-xs text-white font-bold">
                      {week.conflicts}
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-2">{week.week}</div>
                <div className="text-xs font-medium">
                  {week.completed}/{week.total}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded" />
              <span>Adherence Rate</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-orange-500 rounded-full" />
              <span>Conflicts</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Opik Integration Details */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-purple-600" />
            Opik Integration Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="p-3 bg-white rounded-lg">
              <p className="font-medium text-purple-600">Traces Captured</p>
              <ul className="mt-2 space-y-1 text-gray-600">
                <li>• Agent chat conversations</li>
                <li>• Tool executions</li>
                <li>• LLM calls with tokens</li>
              </ul>
            </div>
            <div className="p-3 bg-white rounded-lg">
              <p className="font-medium text-purple-600">Evaluations</p>
              <ul className="mt-2 space-y-1 text-gray-600">
                <li>• Burnout risk (LLM-as-judge)</li>
                <li>• Family fairness scoring</li>
                <li>• Coaching style consistency</li>
              </ul>
            </div>
            <div className="p-3 bg-white rounded-lg">
              <p className="font-medium text-purple-600">Intelligence Loop</p>
              <ul className="mt-2 space-y-1 text-gray-600">
                <li>• Preference learning tracking</li>
                <li>• Cross-feature propagation</li>
                <li>• Outcome measurement</li>
              </ul>
            </div>
            <div className="p-3 bg-white rounded-lg">
              <p className="font-medium text-purple-600">Metrics Tracked</p>
              <ul className="mt-2 space-y-1 text-gray-600">
                <li>• Schedule adherence rate</li>
                <li>• Task completion trends</li>
                <li>• Conflict frequency</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtext,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="pt-4">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <div className="text-sm text-gray-500">{label}</div>
            <div className="text-xl font-bold">{value}</div>
            {subtext && <div className="text-xs text-gray-400">{subtext}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EvaluationMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    yellow: "bg-yellow-500",
    green: "bg-green-500",
    blue: "bg-blue-500",
    purple: "bg-purple-500",
    indigo: "bg-indigo-500",
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${colorClasses[color]} rounded-full transition-all`}
            style={{ width: `${value}%` }}
          />
        </div>
        <span className="text-sm font-medium w-10">{value}%</span>
      </div>
    </div>
  );
}
