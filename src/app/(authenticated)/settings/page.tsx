"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Calendar,
  User,
  LogOut,
  CheckCircle,
  XCircle,
  Loader2,
  Plus,
  Trash2,
  Link,
  ExternalLink,
} from "lucide-react";

interface CalendarProviders {
  google: boolean;
  microsoft: boolean;
}

interface ExternalCalendar {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  lastSync: string | null;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [providers, setProviders] = useState<CalendarProviders | null>(null);
  const [externalCalendars, setExternalCalendars] = useState<ExternalCalendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newCalendarName, setNewCalendarName] = useState("");
  const [newCalendarUrl, setNewCalendarUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [providersRes, calendarsRes] = await Promise.all([
        fetch("/api/calendar/providers"),
        fetch("/api/calendars/external"),
      ]);

      if (providersRes.ok) {
        setProviders(await providersRes.json());
      }
      if (calendarsRes.ok) {
        const data = await calendarsRes.json();
        setExternalCalendars(data.calendars || []);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function addExternalCalendar() {
    if (!newCalendarName.trim() || !newCalendarUrl.trim()) return;
    setAdding(true);

    try {
      const res = await fetch("/api/calendars/external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCalendarName,
          url: newCalendarUrl,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to add calendar");
      }

      setExternalCalendars([...externalCalendars, data.calendar]);
      setNewCalendarName("");
      setNewCalendarUrl("");
      setAddDialogOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to add calendar");
    } finally {
      setAdding(false);
    }
  }

  async function deleteExternalCalendar(id: string) {
    if (!confirm("Remove this calendar?")) return;
    setDeleting(id);

    try {
      const res = await fetch(`/api/calendars/external/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setExternalCalendars(externalCalendars.filter((c) => c.id !== id));
      }
    } catch (error) {
      console.error("Error deleting calendar:", error);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage your account and calendar integrations</p>
      </div>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-gray-600" />
            <CardTitle>Profile</CardTitle>
          </div>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={session?.user?.image || ""} />
              <AvatarFallback className="text-xl">
                {session?.user?.name?.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-medium">{session?.user?.name}</p>
              <p className="text-gray-500">{session?.user?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Primary Calendar */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-600" />
            <CardTitle>Primary Calendar</CardTitle>
          </div>
          <CardDescription>
            Your main calendar for scheduling tasks (read & write)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              {/* Google Calendar */}
              <div
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  providers?.google
                    ? "bg-green-50 border-green-200"
                    : "bg-gray-50 border-gray-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white border flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-6 h-6">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">Google Calendar</p>
                    <p className="text-sm text-gray-500">
                      {providers?.google ? "Connected - events sync both ways" : "Not connected"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {providers?.google ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <Badge className="bg-green-600">Active</Badge>
                    </>
                  ) : (
                    <Button onClick={() => signIn("google", { callbackUrl: "/settings" })}>
                      Connect
                    </Button>
                  )}
                </div>
              </div>

              <div className="text-sm text-gray-600">
                <p className="font-medium mb-2">Permissions:</p>
                <ul className="space-y-1 ml-4">
                  <li className="flex items-center gap-2">
                    {providers?.google ? (
                      <CheckCircle className="h-3 w-3 text-green-600" />
                    ) : (
                      <XCircle className="h-3 w-3 text-gray-400" />
                    )}
                    Read calendar events to find free time
                  </li>
                  <li className="flex items-center gap-2">
                    {providers?.google ? (
                      <CheckCircle className="h-3 w-3 text-green-600" />
                    ) : (
                      <XCircle className="h-3 w-3 text-gray-400" />
                    )}
                    Create events for scheduled tasks
                  </li>
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* External Calendars (ICS) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Link className="h-5 w-5 text-gray-600" />
                <CardTitle>Additional Calendars</CardTitle>
              </div>
              <CardDescription className="mt-1">
                Import work or other calendars via URL (read-only)
              </CardDescription>
            </div>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Calendar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add External Calendar</DialogTitle>
                  <DialogDescription>
                    Import a calendar using its ICS/iCal URL. This allows the AI to see your busy times without needing app access.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="calendarName">Calendar Name</Label>
                    <Input
                      id="calendarName"
                      placeholder="e.g., Work Calendar, Outlook"
                      value={newCalendarName}
                      onChange={(e) => setNewCalendarName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="calendarUrl">Calendar URL (ICS)</Label>
                    <Input
                      id="calendarUrl"
                      placeholder="https://... or webcal://..."
                      value={newCalendarUrl}
                      onChange={(e) => setNewCalendarUrl(e.target.value)}
                    />
                    <p className="text-xs text-gray-500">
                      Paste the ICS/webcal link from your calendar settings
                    </p>
                  </div>

                  <div className="bg-blue-50 p-3 rounded-lg text-sm">
                    <p className="font-medium text-blue-900 mb-2">How to get your calendar URL:</p>
                    <ul className="text-blue-800 space-y-1 text-xs">
                      <li><strong>Outlook/M365:</strong> Settings → Calendar → Shared calendars → Publish a calendar → ICS link</li>
                      <li><strong>Google:</strong> Calendar settings → Integrate calendar → Secret address in iCal format</li>
                      <li><strong>Apple:</strong> Calendar → Share Calendar → Public Calendar → Copy Link</li>
                    </ul>
                  </div>

                  <Button
                    className="w-full"
                    onClick={addExternalCalendar}
                    disabled={adding || !newCalendarName.trim() || !newCalendarUrl.trim()}
                  >
                    {adding ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Add Calendar"
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : externalCalendars.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">No additional calendars</p>
              <p className="text-sm mt-1">
                Add your work calendar to help AI avoid scheduling conflicts
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {externalCalendars.map((calendar) => (
                <div
                  key={calendar.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-purple-100 flex items-center justify-center">
                      <ExternalLink className="h-4 w-4 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{calendar.name}</p>
                      <p className="text-xs text-gray-500">
                        {calendar.lastSync
                          ? `Last synced: ${new Date(calendar.lastSync).toLocaleString()}`
                          : "Not synced yet"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      Read-only
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => deleteExternalCalendar(calendar.id)}
                      disabled={deleting === calendar.id}
                    >
                      {deleting === calendar.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* About Section */}
      <Card>
        <CardHeader>
          <CardTitle>About ResolutionAI</CardTitle>
          <CardDescription>
            Built for the Encode Club Comet Resolution V2 Hackathon
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600">
            ResolutionAI helps you achieve your New Year resolutions by intelligently
            scheduling tasks around your existing calendar commitments. Our AI analyzes
            your schedule and recommends optimal times for your personal goals and
            household responsibilities.
          </p>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Next.js 14</Badge>
            <Badge variant="secondary">Claude AI</Badge>
            <Badge variant="secondary">Google Calendar API</Badge>
            <Badge variant="secondary">ICS Import</Badge>
            <Badge variant="secondary">PostgreSQL</Badge>
            <Badge variant="secondary">TailwindCSS</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">Danger Zone</CardTitle>
          <CardDescription>Irreversible actions for your account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Sign out</p>
              <p className="text-sm text-gray-500">
                Sign out of your ResolutionAI account
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
