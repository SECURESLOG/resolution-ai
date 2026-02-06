"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Copy,
  Check,
  Monitor,
  Users,
  UserPlus,
  Crown,
  Mail,
  Send,
  MapPin,
  Clock,
  Briefcase,
  Home,
  Car,
  Plane,
  Globe,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { LocationSettings } from "@/components/settings/location-settings";

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

interface FamilyMember {
  id: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
}

interface Family {
  id: string;
  name: string;
  inviteCode: string;
  members: FamilyMember[];
}

interface WorkScheduleDay {
  dayOfWeek: string;
  isWorking: boolean;
  startTime: string | null;
  endTime: string | null;
  location: "home" | "office";
  commuteToMin: number | null;
  commuteFromMin: number | null;
}

interface Vacation {
  id: string;
  startDate: string;
  endDate: string;
  note: string | null;
}

interface PublicHoliday {
  date: string;
  name: string;
  isObserved: boolean;
}

interface Country {
  code: string;
  name: string;
}

const DAYS_OF_WEEK = [
  { value: "monday", label: "Mon", fullLabel: "Monday" },
  { value: "tuesday", label: "Tue", fullLabel: "Tuesday" },
  { value: "wednesday", label: "Wed", fullLabel: "Wednesday" },
  { value: "thursday", label: "Thu", fullLabel: "Thursday" },
  { value: "friday", label: "Fri", fullLabel: "Friday" },
  { value: "saturday", label: "Sat", fullLabel: "Saturday" },
  { value: "sunday", label: "Sun", fullLabel: "Sunday" },
];

export default function SettingsPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") || "account";
  const [providers, setProviders] = useState<CalendarProviders | null>(null);
  const [externalCalendars, setExternalCalendars] = useState<ExternalCalendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newCalendarName, setNewCalendarName] = useState("");
  const [newCalendarUrl, setNewCalendarUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Outlook Add-in state
  const [addinToken, setAddinToken] = useState<string | null>(null);
  const [addinTokenExpiry, setAddinTokenExpiry] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  // Family state
  const [family, setFamily] = useState<Family | null>(null);
  const [familyRole, setFamilyRole] = useState<string | null>(null);
  const [familyLoading, setFamilyLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [familyName, setFamilyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);

  // Work Schedule state
  const [workSchedule, setWorkSchedule] = useState<WorkScheduleDay[]>([]);
  const [bufferMinutes, setBufferMinutes] = useState<number>(0);
  const [availableTimeStart, setAvailableTimeStart] = useState<number>(6);
  const [availableTimeEnd, setAvailableTimeEnd] = useState<number>(22);
  const [country, setCountry] = useState<string>("UK");
  const [supportedCountries, setSupportedCountries] = useState<Country[]>([]);
  const [workScheduleLoading, setWorkScheduleLoading] = useState(true);
  const [savingWorkSchedule, setSavingWorkSchedule] = useState(false);
  const [workScheduleChanged, setWorkScheduleChanged] = useState(false);

  // Vacation state
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [vacationLoading, setVacationLoading] = useState(true);
  const [addVacationOpen, setAddVacationOpen] = useState(false);
  const [newVacationStart, setNewVacationStart] = useState("");
  const [newVacationEnd, setNewVacationEnd] = useState("");
  const [newVacationNote, setNewVacationNote] = useState("");
  const [addingVacation, setAddingVacation] = useState(false);
  const [deletingVacation, setDeletingVacation] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    fetchFamily();
    fetchWorkSchedule();
    fetchVacations();
    fetchHolidays();
  }, []);

  async function fetchData() {
    try {
      const [providersRes, calendarsRes, tokenRes] = await Promise.all([
        fetch("/api/calendar/providers"),
        fetch("/api/calendars/external"),
        fetch("/api/addin/token"),
      ]);

      if (providersRes.ok) {
        setProviders(await providersRes.json());
      }
      if (calendarsRes.ok) {
        const data = await calendarsRes.json();
        setExternalCalendars(data.calendars || []);
      }
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        setAddinToken(tokenData.token);
        setAddinTokenExpiry(tokenData.expiresAt);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchFamily() {
    try {
      const res = await fetch("/api/family");
      if (res.ok) {
        const data = await res.json();
        setFamily(data.family);
        setFamilyRole(data.role);
      }
    } catch (error) {
      console.error("Error fetching family:", error);
    } finally {
      setFamilyLoading(false);
    }
  }

  async function fetchWorkSchedule() {
    try {
      const res = await fetch("/api/user/work-schedule");
      if (res.ok) {
        const data = await res.json();
        setWorkSchedule(data.schedules);
        setBufferMinutes(data.bufferMinutes || 0);
        setAvailableTimeStart(data.availableTimeStart ?? 6);
        setAvailableTimeEnd(data.availableTimeEnd ?? 22);
        setCountry(data.country || "UK");
      }
    } catch (error) {
      console.error("Error fetching work schedule:", error);
    } finally {
      setWorkScheduleLoading(false);
    }
  }

  async function fetchVacations() {
    try {
      const res = await fetch("/api/user/vacations");
      if (res.ok) {
        const data = await res.json();
        setVacations(data.vacations || []);
      }
    } catch (error) {
      console.error("Error fetching vacations:", error);
    } finally {
      setVacationLoading(false);
    }
  }

  async function fetchHolidays() {
    try {
      const res = await fetch("/api/user/holidays?months=12");
      if (res.ok) {
        const data = await res.json();
        setHolidays(data.holidays || []);
        setSupportedCountries(data.supportedCountries || []);
      }
    } catch (error) {
      console.error("Error fetching holidays:", error);
    }
  }

  async function saveWorkSchedule() {
    setSavingWorkSchedule(true);
    try {
      const res = await fetch("/api/user/work-schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedules: workSchedule,
          bufferMinutes,
          availableTimeStart,
          availableTimeEnd,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save work schedule");
      }

      setWorkScheduleChanged(false);
    } catch (error) {
      alert("Failed to save work schedule");
      console.error("Error saving work schedule:", error);
    } finally {
      setSavingWorkSchedule(false);
    }
  }

  async function updateCountry(newCountry: string) {
    try {
      const res = await fetch("/api/user/country", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: newCountry }),
      });

      if (res.ok) {
        setCountry(newCountry);
        // Refresh holidays for new country
        fetchHolidays();
      }
    } catch (error) {
      console.error("Error updating country:", error);
    }
  }

  function updateWorkScheduleDay(dayOfWeek: string, updates: Partial<WorkScheduleDay>) {
    setWorkSchedule((prev) =>
      prev.map((day) =>
        day.dayOfWeek === dayOfWeek ? { ...day, ...updates } : day
      )
    );
    setWorkScheduleChanged(true);
  }

  async function addVacation() {
    if (!newVacationStart || !newVacationEnd) return;
    setAddingVacation(true);

    try {
      const res = await fetch("/api/user/vacations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: newVacationStart,
          endDate: newVacationEnd,
          note: newVacationNote || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add vacation");
      }

      const data = await res.json();
      setVacations([...vacations, data.vacation]);
      setNewVacationStart("");
      setNewVacationEnd("");
      setNewVacationNote("");
      setAddVacationOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to add vacation");
    } finally {
      setAddingVacation(false);
    }
  }

  async function deleteVacation(id: string) {
    if (!confirm("Delete this time off?")) return;
    setDeletingVacation(id);

    try {
      const res = await fetch(`/api/user/vacations/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setVacations(vacations.filter((v) => v.id !== id));
      }
    } catch (error) {
      console.error("Error deleting vacation:", error);
    } finally {
      setDeletingVacation(null);
    }
  }

  async function generateAddinToken() {
    setGeneratingToken(true);
    try {
      const res = await fetch("/api/addin/token");
      if (res.ok) {
        const data = await res.json();
        setAddinToken(data.token);
        setAddinTokenExpiry(data.expiresAt);
      }
    } catch (error) {
      console.error("Error generating token:", error);
    } finally {
      setGeneratingToken(false);
    }
  }

  async function revokeAddinToken() {
    try {
      const res = await fetch("/api/addin/token", { method: "DELETE" });
      if (res.ok) {
        setAddinToken(null);
        setAddinTokenExpiry(null);
      }
    } catch (error) {
      console.error("Error revoking token:", error);
    }
  }

  function copyToken() {
    if (addinToken) {
      navigator.clipboard.writeText(addinToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
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

  // Family functions
  async function createFamily() {
    if (!familyName.trim()) return;
    setCreating(true);

    try {
      const res = await fetch("/api/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: familyName }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create family");
      }

      setFamily(data.family);
      setFamilyRole(data.role);
      setCreateDialogOpen(false);
      setFamilyName("");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to create family");
    } finally {
      setCreating(false);
    }
  }

  async function joinFamily() {
    if (!inviteCode.trim()) return;
    setJoining(true);

    try {
      const res = await fetch("/api/family/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to join family");
      }

      setFamily(data.family);
      setFamilyRole(data.role);
      setJoinDialogOpen(false);
      setInviteCode("");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to join family");
    } finally {
      setJoining(false);
    }
  }

  async function leaveFamily() {
    if (!confirm("Are you sure you want to leave this family?")) return;
    setLeaving(true);

    try {
      const res = await fetch("/api/family/leave", {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to leave family");
      }

      setFamily(null);
      setFamilyRole(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to leave family");
    } finally {
      setLeaving(false);
    }
  }

  function copyInviteCode() {
    if (family?.inviteCode) {
      navigator.clipboard.writeText(family.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function sendEmailInvite() {
    if (!inviteEmail.trim()) return;
    setSendingInvite(true);

    try {
      const res = await fetch("/api/family/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send invitation");
      }

      setInviteSent(true);
      setInviteEmail("");
      setTimeout(() => setInviteSent(false), 3000);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to send invitation");
    } finally {
      setSendingInvite(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage your account and preferences</p>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="account" className="flex items-center gap-1.5">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Account</span>
          </TabsTrigger>
          <TabsTrigger value="schedule" className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Work Schedule</span>
          </TabsTrigger>
          <TabsTrigger value="calendars" className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Calendars</span>
          </TabsTrigger>
          <TabsTrigger value="family" className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Family</span>
          </TabsTrigger>
          <TabsTrigger value="location" className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" />
            <span className="hidden sm:inline">Location</span>
          </TabsTrigger>
        </TabsList>

        {/* Account Tab */}
        <TabsContent value="account" className="space-y-6">
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
                ResolutionAI helps busy people reclaim their time by eliminating scheduling
                decisions. AI protects your focus time, balances your workload, and handles
                the mental load of figuring out when to do what.
              </p>

              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Next.js 14</Badge>
                <Badge variant="secondary">Claude AI</Badge>
                <Badge variant="secondary">Google Calendar API</Badge>
                <Badge variant="secondary">PostgreSQL</Badge>
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
        </TabsContent>

        {/* Work Schedule Tab */}
        <TabsContent value="schedule" className="space-y-6">
          {workScheduleLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              {/* Work Hours Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-5 w-5 text-gray-600" />
                      <CardTitle>Work Hours</CardTitle>
                    </div>
                    {workScheduleChanged && (
                      <Button
                        size="sm"
                        onClick={saveWorkSchedule}
                        disabled={savingWorkSchedule}
                      >
                        {savingWorkSchedule ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          "Save Changes"
                        )}
                      </Button>
                    )}
                  </div>
                  <CardDescription>
                    Configure your typical work schedule. AI uses this to schedule tasks around your work.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Schedule Table */}
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Day</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Working</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Hours</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Location</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Commute</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {workSchedule.map((day) => {
                          const dayInfo = DAYS_OF_WEEK.find((d) => d.value === day.dayOfWeek);
                          return (
                            <tr key={day.dayOfWeek} className={!day.isWorking ? "bg-gray-50" : ""}>
                              <td className="px-3 py-2 font-medium">{dayInfo?.fullLabel}</td>
                              <td className="px-3 py-2">
                                <Switch
                                  checked={day.isWorking}
                                  onCheckedChange={(checked) =>
                                    updateWorkScheduleDay(day.dayOfWeek, { isWorking: checked })
                                  }
                                />
                              </td>
                              <td className="px-3 py-2">
                                {day.isWorking ? (
                                  <div className="flex items-center gap-1">
                                    <Input
                                      type="time"
                                      value={day.startTime || "09:00"}
                                      onChange={(e) =>
                                        updateWorkScheduleDay(day.dayOfWeek, { startTime: e.target.value })
                                      }
                                      className="w-24 h-8 text-xs"
                                    />
                                    <span className="text-gray-400">-</span>
                                    <Input
                                      type="time"
                                      value={day.endTime || "17:00"}
                                      onChange={(e) =>
                                        updateWorkScheduleDay(day.dayOfWeek, { endTime: e.target.value })
                                      }
                                      className="w-24 h-8 text-xs"
                                    />
                                  </div>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {day.isWorking ? (
                                  <Select
                                    value={day.location}
                                    onValueChange={(value: "home" | "office") =>
                                      updateWorkScheduleDay(day.dayOfWeek, {
                                        location: value,
                                        commuteToMin: value === "home" ? null : day.commuteToMin,
                                        commuteFromMin: value === "home" ? null : day.commuteFromMin,
                                      })
                                    }
                                  >
                                    <SelectTrigger className="w-24 h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="home">
                                        <span className="flex items-center gap-1">
                                          <Home className="h-3 w-3" /> Home
                                        </span>
                                      </SelectItem>
                                      <SelectItem value="office">
                                        <span className="flex items-center gap-1">
                                          <Briefcase className="h-3 w-3" /> Office
                                        </span>
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {day.isWorking && day.location === "office" ? (
                                  <div className="flex items-center gap-1 text-xs">
                                    <Car className="h-3 w-3 text-gray-400" />
                                    <Input
                                      type="number"
                                      min="0"
                                      max="180"
                                      value={day.commuteToMin || ""}
                                      onChange={(e) =>
                                        updateWorkScheduleDay(day.dayOfWeek, {
                                          commuteToMin: e.target.value ? parseInt(e.target.value) : null,
                                        })
                                      }
                                      placeholder="To"
                                      className="w-14 h-8 text-xs"
                                    />
                                    <span className="text-gray-400">/</span>
                                    <Input
                                      type="number"
                                      min="0"
                                      max="180"
                                      value={day.commuteFromMin || ""}
                                      onChange={(e) =>
                                        updateWorkScheduleDay(day.dayOfWeek, {
                                          commuteFromMin: e.target.value ? parseInt(e.target.value) : null,
                                        })
                                      }
                                      placeholder="From"
                                      className="w-14 h-8 text-xs"
                                    />
                                    <span className="text-gray-400 text-xs">min</span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Buffer Time */}
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">Buffer between tasks</p>
                      <p className="text-xs text-gray-500">Add breathing room between scheduled tasks</p>
                    </div>
                    <Select
                      value={bufferMinutes.toString()}
                      onValueChange={(value) => {
                        setBufferMinutes(parseInt(value));
                        setWorkScheduleChanged(true);
                      }}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">None</SelectItem>
                        <SelectItem value="15">15 min</SelectItem>
                        <SelectItem value="30">30 min</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Personal Time Window */}
                  <div className="p-3 bg-blue-50 rounded-lg space-y-3">
                    <div>
                      <p className="font-medium text-sm">Personal Time Window</p>
                      <p className="text-xs text-gray-500">Tasks will only be scheduled within this window, outside your work hours</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-gray-600">From</Label>
                        <Select
                          value={availableTimeStart.toString()}
                          onValueChange={(value) => {
                            setAvailableTimeStart(parseInt(value));
                            setWorkScheduleChanged(true);
                          }}
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 24 }, (_, i) => (
                              <SelectItem key={i} value={i.toString()}>
                                {i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-gray-600">To</Label>
                        <Select
                          value={availableTimeEnd.toString()}
                          onValueChange={(value) => {
                            setAvailableTimeEnd(parseInt(value));
                            setWorkScheduleChanged(true);
                          }}
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 24 }, (_, i) => (
                              <SelectItem key={i} value={i.toString()}>
                                {i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Country & Public Holidays */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-gray-600" />
                    <CardTitle>Country & Public Holidays</CardTitle>
                  </div>
                  <CardDescription>
                    Public holidays are automatically blocked for scheduling
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Your Country</Label>
                    <Select value={country} onValueChange={updateCountry}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {supportedCountries.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {holidays.length > 0 && (
                    <div className="border rounded-lg p-3">
                      <p className="text-sm font-medium mb-2">Upcoming Public Holidays</p>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {holidays.slice(0, 10).map((holiday, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-sm py-1"
                          >
                            <span className="text-gray-600">{holiday.name}</span>
                            <span className="text-gray-400">
                              {new Date(holiday.date).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Vacation / Time Off */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Plane className="h-5 w-5 text-gray-600" />
                      <CardTitle>Time Off</CardTitle>
                    </div>
                    <Dialog open={addVacationOpen} onOpenChange={setAddVacationOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm">
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Time Off</DialogTitle>
                          <DialogDescription>
                            Block out dates when you&apos;re not available for tasks
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 mt-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label>From</Label>
                              <Input
                                type="date"
                                value={newVacationStart}
                                onChange={(e) => setNewVacationStart(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>To</Label>
                              <Input
                                type="date"
                                value={newVacationEnd}
                                onChange={(e) => setNewVacationEnd(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Note (optional)</Label>
                            <Input
                              placeholder="e.g., Holiday, Work trip"
                              value={newVacationNote}
                              onChange={(e) => setNewVacationNote(e.target.value)}
                            />
                          </div>
                          <Button
                            className="w-full"
                            onClick={addVacation}
                            disabled={addingVacation || !newVacationStart || !newVacationEnd}
                          >
                            {addingVacation ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Adding...
                              </>
                            ) : (
                              "Add Time Off"
                            )}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <CardDescription>
                    Vacations and time off periods. Tasks won&apos;t be assigned during these dates.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {vacationLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                  ) : vacations.length === 0 ? (
                    <div className="text-center py-6 text-gray-500">
                      <Plane className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">No time off scheduled</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {vacations.map((vacation) => (
                        <div
                          key={vacation.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
                        >
                          <div>
                            <p className="font-medium text-sm">
                              {new Date(vacation.startDate).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                              {" - "}
                              {new Date(vacation.endDate).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </p>
                            {vacation.note && (
                              <p className="text-xs text-gray-500">{vacation.note}</p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => deleteVacation(vacation.id)}
                            disabled={deletingVacation === vacation.id}
                          >
                            {deletingVacation === vacation.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Calendars Tab */}
        <TabsContent value="calendars" className="space-y-6">
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
                      Add
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Add External Calendar</DialogTitle>
                      <DialogDescription>
                        Import a calendar using its ICS/iCal URL.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label htmlFor="calendarName">Calendar Name</Label>
                        <Input
                          id="calendarName"
                          placeholder="e.g., Work Calendar"
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
                      </div>

                      {/* ICS Instructions */}
                      <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-3">
                        <p className="font-medium text-gray-700">How to get your calendar ICS link:</p>

                        <div>
                          <p className="font-medium text-blue-600">Google Calendar</p>
                          <p className="text-gray-600">Settings → Select calendar → Integrate calendar → Copy &quot;Secret address in iCal format&quot;</p>
                        </div>

                        <div>
                          <p className="font-medium text-blue-600">Microsoft Outlook/365</p>
                          <p className="text-gray-600">Settings → Calendar → Shared calendars → Publish a calendar → Select calendar → Create ICS link</p>
                        </div>

                        <div>
                          <p className="font-medium text-blue-600">Apple iCloud</p>
                          <p className="text-gray-600">iCloud.com → Calendar → Share icon next to calendar → Public Calendar → Copy Link</p>
                        </div>
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
                <div className="text-center py-6 text-gray-500">
                  <Calendar className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No additional calendars</p>
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
                              ? `Synced: ${new Date(calendar.lastSync).toLocaleString()}`
                              : "Not synced yet"}
                          </p>
                        </div>
                      </div>
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
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Outlook Add-in Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Monitor className="h-5 w-5 text-gray-600" />
                <CardTitle>Outlook Add-in</CardTitle>
              </div>
              <CardDescription>
                Sync tasks to your corporate M365 calendar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {addinToken ? (
                <div className="space-y-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <Label className="text-sm text-gray-600">Connection Token</Label>
                    <div className="flex items-center gap-2 mt-2">
                      <code className="flex-1 text-sm font-mono bg-white px-3 py-2 rounded border truncate">
                        {addinToken.substring(0, 20)}...
                      </code>
                      <Button variant="outline" size="icon" onClick={copyToken}>
                        {tokenCopied ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Expires: {addinTokenExpiry ? new Date(addinTokenExpiry).toLocaleDateString() : "N/A"}
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={revokeAddinToken}
                    className="text-red-600 hover:text-red-700"
                  >
                    Revoke Token
                  </Button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <Monitor className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm text-gray-500 mb-3">
                    Generate a token to connect the Outlook Add-in
                  </p>
                  <Button onClick={generateAddinToken} disabled={generatingToken} size="sm">
                    {generatingToken ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      "Generate Token"
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Family Tab */}
        <TabsContent value="family" className="space-y-6">
          {familyLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : !family ? (
            <>
              {/* No family yet - show create/join options */}
              <Card className="bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <Users className="h-12 w-12 text-blue-600 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold mb-1">No family yet</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Create or join a family to coordinate schedules with your partner
                    </p>
                  </div>
                </CardContent>
              </Card>

              <div className="grid md:grid-cols-2 gap-4">
                {/* Create Family Card */}
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-2">
                      <Plus className="h-5 w-5 text-blue-600" />
                    </div>
                    <CardTitle className="text-base">Create a Family</CardTitle>
                    <CardDescription className="text-sm">
                      Start a new family and invite your partner
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                      <DialogTrigger asChild>
                        <Button className="w-full" size="sm">Create Family</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Create a Family</DialogTitle>
                          <DialogDescription>
                            Give your family a name. You&apos;ll get an invite code to share.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 mt-4">
                          <div className="space-y-2">
                            <Label htmlFor="familyName">Family Name</Label>
                            <Input
                              id="familyName"
                              placeholder="e.g., The Smiths"
                              value={familyName}
                              onChange={(e) => setFamilyName(e.target.value)}
                            />
                          </div>
                          <Button
                            className="w-full"
                            onClick={createFamily}
                            disabled={creating || !familyName.trim()}
                          >
                            {creating ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Creating...
                              </>
                            ) : (
                              "Create Family"
                            )}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </CardContent>
                </Card>

                {/* Join Family Card */}
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-2">
                      <UserPlus className="h-5 w-5 text-green-600" />
                    </div>
                    <CardTitle className="text-base">Join a Family</CardTitle>
                    <CardDescription className="text-sm">
                      Enter an invite code from your partner
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full" size="sm">Join Family</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Join a Family</DialogTitle>
                          <DialogDescription>
                            Enter the invite code shared by your partner.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 mt-4">
                          <div className="space-y-2">
                            <Label htmlFor="inviteCode">Invite Code</Label>
                            <Input
                              id="inviteCode"
                              placeholder="e.g., ABC123DE"
                              value={inviteCode}
                              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                              className="uppercase"
                            />
                          </div>
                          <Button
                            className="w-full"
                            onClick={joinFamily}
                            disabled={joining || !inviteCode.trim()}
                          >
                            {joining ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Joining...
                              </>
                            ) : (
                              "Join Family"
                            )}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-4 pb-4">
                  <h4 className="font-medium text-blue-900 mb-2 text-sm">Why create a family?</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• AI considers both calendars when scheduling</li>
                    <li>• Balanced distribution of life admin</li>
                    <li>• See each other&apos;s scheduled tasks</li>
                  </ul>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              {/* Has family - show family details */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                        <Users className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <CardTitle>{family.name}</CardTitle>
                        <CardDescription>{family.members.length} member(s)</CardDescription>
                      </div>
                    </div>
                    {familyRole === "admin" && <Badge>Admin</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Invite Code */}
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <Label className="text-sm text-gray-600">Invite Code</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xl font-mono font-bold tracking-wider">
                        {family.inviteCode}
                      </code>
                      <Button variant="ghost" size="icon" onClick={copyInviteCode}>
                        {copied ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Email Invite - only show if family has less than 2 members */}
                  {family.members.length < 2 && (
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <Label className="text-sm text-blue-800 flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        Invite by Email
                      </Label>
                      <div className="flex gap-2 mt-2">
                        <Input
                          type="email"
                          placeholder="partner@email.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          className="flex-1 bg-white"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && inviteEmail.trim()) {
                              sendEmailInvite();
                            }
                          }}
                        />
                        <Button
                          onClick={sendEmailInvite}
                          disabled={sendingInvite || !inviteEmail.trim() || inviteSent}
                          size="sm"
                          className={inviteSent ? "bg-green-600 hover:bg-green-600" : ""}
                        >
                          {sendingInvite ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : inviteSent ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  <Separator />

                  {/* Family Members */}
                  <div>
                    <Label className="text-sm text-gray-600">Family Members</Label>
                    <div className="space-y-2 mt-2">
                      {family.members.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between p-3 bg-white border rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={member.user.image || ""} />
                              <AvatarFallback>
                                {member.user.name?.charAt(0).toUpperCase() || "U"}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">{member.user.name}</p>
                              <p className="text-xs text-gray-500">{member.user.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {member.role === "admin" && (
                              <Crown className="h-4 w-4 text-yellow-500" />
                            )}
                          </div>
                        </div>
                      ))}

                      {family.members.length < 2 && (
                        <div className="p-3 border-2 border-dashed rounded-lg text-center text-gray-500">
                          <UserPlus className="h-6 w-6 mx-auto mb-1 text-gray-400" />
                          <p className="text-sm">Waiting for partner to join</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Leave Family */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={leaveFamily}
                    disabled={leaving}
                  >
                    {leaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Leaving...
                      </>
                    ) : (
                      <>
                        <LogOut className="mr-2 h-4 w-4" />
                        Leave Family
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Info Card */}
              {family.members.length === 2 && (
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="pt-4 pb-4">
                    <h4 className="font-medium text-green-900 mb-1 text-sm">Family Complete!</h4>
                    <p className="text-sm text-green-800">
                      When you generate a schedule, the AI will consider both calendars
                      and balance the workload fairly.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Location Tab */}
        <TabsContent value="location" className="space-y-6">
          <LocationSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
