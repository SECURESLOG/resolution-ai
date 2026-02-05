"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Users,
  Plus,
  UserPlus,
  Copy,
  Check,
  LogOut,
  Loader2,
  Crown,
  Calendar,
  Mail,
  Send,
} from "lucide-react";

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

export default function FamilyPage() {
  const [family, setFamily] = useState<Family | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    fetchFamily();
  }, []);

  async function fetchFamily() {
    try {
      const res = await fetch("/api/family");
      if (res.ok) {
        const data = await res.json();
        setFamily(data.family);
        setRole(data.role);
      }
    } catch (error) {
      console.error("Error fetching family:", error);
    } finally {
      setLoading(false);
    }
  }

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
      setRole(data.role);
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
      setRole(data.role);
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
      setRole(null);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // No family yet - show create/join options
  if (!family) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Family</h1>
          <p className="text-gray-600 mt-1">
            Create or join a family to coordinate schedules with your partner
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Create Family Card */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-2">
                <Plus className="h-6 w-6 text-blue-600" />
              </div>
              <CardTitle>Create a Family</CardTitle>
              <CardDescription>
                Start a new family and invite your partner to join
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full">Create Family</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create a Family</DialogTitle>
                    <DialogDescription>
                      Give your family a name. You&apos;ll get an invite code to share with your partner.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label htmlFor="familyName">Family Name</Label>
                      <Input
                        id="familyName"
                        placeholder="e.g., The Smiths, Our Family"
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
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-2">
                <UserPlus className="h-6 w-6 text-green-600" />
              </div>
              <CardTitle>Join a Family</CardTitle>
              <CardDescription>
                Enter an invite code from your partner to join their family
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">Join Family</Button>
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
          <CardContent className="pt-6">
            <h3 className="font-semibold text-blue-900 mb-2">Why create a family?</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• AI considers both calendars when scheduling</li>
              <li>• Balanced distribution of life admin</li>
              <li>• See each other&apos;s time blocks</li>
              <li>• Coordinate focus time and goals together</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Has family - show family details
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Family</h1>
        <p className="text-gray-600 mt-1">Manage your family and coordinate schedules</p>
      </div>

      {/* Family Info Card */}
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
            {role === "admin" && <Badge>Admin</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Invite Code */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <Label className="text-sm text-gray-600">Invite Code</Label>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-2xl font-mono font-bold tracking-wider">
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
            <p className="text-xs text-gray-500 mt-1">
              Share this code with your partner to invite them
            </p>
          </div>

          {/* Email Invite - only show if family has less than 2 members */}
          {family.members.length < 2 && (
            <div className="p-4 bg-blue-50 rounded-lg">
              <Label className="text-sm text-blue-800 flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Invite by Email
              </Label>
              <p className="text-xs text-blue-600 mt-1 mb-3">
                Send an invitation email with the invite code directly to your partner
              </p>
              <div className="flex gap-2">
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
                  className={inviteSent ? "bg-green-600 hover:bg-green-600" : ""}
                >
                  {sendingInvite ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : inviteSent ? (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Sent!
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-1" />
                      Send
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          <Separator />

          {/* Family Members */}
          <div>
            <Label className="text-sm text-gray-600">Family Members</Label>
            <div className="space-y-3 mt-3">
              {family.members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 bg-white border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={member.user.image || ""} />
                      <AvatarFallback>
                        {member.user.name?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{member.user.name}</p>
                      <p className="text-sm text-gray-500">{member.user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.role === "admin" && (
                      <Crown className="h-4 w-4 text-yellow-500" />
                    )}
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Connected
                    </Badge>
                  </div>
                </div>
              ))}

              {family.members.length < 2 && (
                <div className="p-4 border-2 border-dashed rounded-lg text-center text-gray-500">
                  <UserPlus className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p>Waiting for partner to join...</p>
                  <p className="text-sm">Share the invite code above</p>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Leave Family */}
          <Button
            variant="outline"
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
          <CardContent className="pt-6">
            <h3 className="font-semibold text-green-900 mb-2">Family Complete!</h3>
            <p className="text-sm text-green-800">
              When you generate a schedule, the AI will consider both calendars
              and balance the workload fairly between family members.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
