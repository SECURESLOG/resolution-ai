"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Check,
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  ExternalLink,
} from "lucide-react";

interface PendingTask {
  id: string;
  taskId: string;
  title: string;
  type: string;
  category: string | null;
  startTime: string;
  endTime: string;
  description: string;
}

declare global {
  interface Window {
    Office?: {
      initialize: (callback: () => void) => void;
      context?: {
        mailbox?: {
          item?: unknown;
          userProfile?: {
            emailAddress: string;
            displayName: string;
          };
        };
      };
    };
  }
}

export default function OutlookAddinPage() {
  const [officeReady, setOfficeReady] = useState(false);
  const [token, setToken] = useState("");
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncedTasks, setSyncedTasks] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    // Check if running in Office context
    if (typeof window !== "undefined" && window.Office) {
      window.Office.initialize = () => {
        setOfficeReady(true);
        // Get user email from Office context
        const email = window.Office?.context?.mailbox?.userProfile?.emailAddress;
        if (email) {
          setUserEmail(email);
        }
      };
    } else {
      // Running outside Office (for testing)
      setOfficeReady(true);
    }

    // Load saved token from localStorage
    const saved = localStorage.getItem("resolutionai_addin_token");
    if (saved) {
      setSavedToken(saved);
    }
  }, []);

  async function saveToken() {
    if (!token.trim()) return;
    localStorage.setItem("resolutionai_addin_token", token);
    setSavedToken(token);
    setToken("");
    await fetchTasks(token);
  }

  async function fetchTasks(authToken?: string) {
    const useToken = authToken || savedToken;
    if (!useToken) return;

    setLoading(true);
    setError(null);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const response = await fetch(`${baseUrl}/api/addin/tasks`, {
        headers: {
          Authorization: `Bearer ${useToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem("resolutionai_addin_token");
          setSavedToken(null);
          throw new Error("Token expired. Please get a new token from ResolutionAI settings.");
        }
        throw new Error("Failed to fetch tasks");
      }

      const data = await response.json();
      setTasks(data.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch tasks");
    } finally {
      setLoading(false);
    }
  }

  async function syncTaskToCalendar(task: PendingTask) {
    setSyncing(task.id);
    setError(null);

    try {
      // Create calendar event using Office.js
      if (window.Office?.context?.mailbox) {
        const startTime = new Date(task.startTime);
        const endTime = new Date(task.endTime);

        // Use EWS or REST API to create event
        // For now, we'll use a workaround - open a new appointment form
        const mailbox = window.Office.context.mailbox as {
          displayNewAppointmentForm?: (parameters: {
            requiredAttendees?: string[];
            optionalAttendees?: string[];
            start: Date;
            end: Date;
            location?: string;
            subject: string;
            body?: string;
          }) => void;
        };

        if (mailbox.displayNewAppointmentForm) {
          mailbox.displayNewAppointmentForm({
            start: startTime,
            end: endTime,
            subject: `[ResolutionAI] ${task.title}`,
            body: task.description,
          });

          // Mark as synced (user will save the appointment)
          await markTaskSynced(task.id, `outlook_${Date.now()}`);
          setSyncedTasks(prev => new Set(Array.from(prev).concat(task.id)));
        } else {
          throw new Error("Calendar API not available");
        }
      } else {
        // Fallback for testing outside Outlook
        console.log("Would create event:", task);
        await markTaskSynced(task.id, `test_${Date.now()}`);
        setSyncedTasks(prev => new Set(Array.from(prev).concat(task.id)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync task");
    } finally {
      setSyncing(null);
    }
  }

  async function markTaskSynced(taskId: string, eventId: string) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    await fetch(`${baseUrl}/api/addin/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${savedToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        taskId,
        workCalendarEventId: eventId,
      }),
    });
  }

  async function syncAllTasks() {
    for (const task of tasks) {
      if (!syncedTasks.has(task.id)) {
        await syncTaskToCalendar(task);
      }
    }
  }

  function formatTime(isoString: string) {
    return new Date(isoString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDate(isoString: string) {
    return new Date(isoString).toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function disconnectToken() {
    localStorage.removeItem("resolutionai_addin_token");
    setSavedToken(null);
    setTasks([]);
  }

  // Not connected - show token input
  if (!savedToken) {
    return (
      <div className="p-4 max-w-md mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center mx-auto mb-2">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <CardTitle>ResolutionAI Sync</CardTitle>
            <CardDescription>
              Connect to sync your scheduled tasks to this calendar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">Connection Token</Label>
              <Input
                id="token"
                type="password"
                placeholder="Paste your token here"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                Get your token from ResolutionAI Settings → Outlook Add-in
              </p>
            </div>

            <Button
              className="w-full"
              onClick={saveToken}
              disabled={!token.trim()}
            >
              Connect
            </Button>

            <div className="text-center">
              <a
                href="https://localhost:3000/settings"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                Open ResolutionAI Settings
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Connected - show tasks
  return (
    <div className="p-4 max-w-md mx-auto space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Calendar className="w-4 h-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">ResolutionAI</CardTitle>
                {userEmail && (
                  <p className="text-xs text-gray-500">{userEmail}</p>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchTasks()}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4" />
              <p className="text-sm">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
            <p className="text-sm text-gray-500 mt-2">Loading tasks...</p>
          </CardContent>
        </Card>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-2" />
            <p className="font-medium">All synced!</p>
            <p className="text-sm text-gray-500">
              No pending tasks to sync to your work calendar
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {tasks.length} task{tasks.length !== 1 ? "s" : ""} to sync
            </p>
            <Button size="sm" onClick={syncAllTasks} disabled={syncing !== null}>
              Sync All
            </Button>
          </div>

          <div className="space-y-2">
            {tasks.map((task) => (
              <Card
                key={task.id}
                className={syncedTasks.has(task.id) ? "bg-green-50 border-green-200" : ""}
              >
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{task.title}</p>
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            task.type === "resolution"
                              ? "border-purple-300 text-purple-700"
                              : "border-blue-300 text-blue-700"
                          }`}
                        >
                          {task.type}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDate(task.startTime)} • {formatTime(task.startTime)} -{" "}
                        {formatTime(task.endTime)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={syncedTasks.has(task.id) ? "ghost" : "default"}
                      onClick={() => syncTaskToCalendar(task)}
                      disabled={syncing === task.id || syncedTasks.has(task.id)}
                      className="shrink-0"
                    >
                      {syncing === task.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : syncedTasks.has(task.id) ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        "Sync"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <div className="pt-4 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-gray-500"
          onClick={disconnectToken}
        >
          Disconnect
        </Button>
      </div>
    </div>
  );
}
