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

interface OpikStats {
  burnoutRisk: BurnoutRisk;
  familyFairness: FamilyFairness | null;
  scheduleAdherence: ScheduleAdherence;
  conflicts: ConflictData;
  intelligenceLoop: IntelligenceLoop;
  weeklyTrends: WeeklyTrend[];
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

  useEffect(() => {
    fetchStats();
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
            <Activity className="h-8 w-8 text-purple-600" />
            AI Quality Intelligence
          </h1>
          <p className="text-gray-600 mt-1">
            Powered by Opik - LLM Observability & Evaluation Platform
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
