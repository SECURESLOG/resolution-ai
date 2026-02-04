"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Calendar,
  Brain,
  CheckCircle,
  Users,
  ArrowRight,
  Sparkles,
  MessageSquare,
  TrendingUp,
  Clock,
  Zap,
  Heart,
  BarChart3,
} from "lucide-react";

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      router.push("/dashboard");
    }
  }, [session, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const features = [
    {
      icon: MessageSquare,
      title: "Eliminate Decision Fatigue",
      description: "Stop wasting mental energy deciding when to do things. AI finds the optimal time automatically.",
    },
    {
      icon: Brain,
      title: "Learns Your Productivity Patterns",
      description: "AI learns when you're most focused, when you need breaks, and adapts your schedule accordingly.",
    },
    {
      icon: Calendar,
      title: "Protect Your Focus Time",
      description: "Automatically blocks time for deep work and prevents calendar overload before it happens.",
    },
    {
      icon: Users,
      title: "Work-Life Balance",
      description: "Fair distribution of life admin between family members. Stop carrying the mental load alone.",
    },
    {
      icon: TrendingUp,
      title: "Automated Weekly Planning",
      description: "Start each week with an optimized schedule. No more Sunday night planning anxiety.",
    },
    {
      icon: Heart,
      title: "Prevent Burnout",
      description: "Monitors your schedule health and warns you before you overcommit. Protect your energy.",
    },
  ];

  const capabilities = [
    {
      icon: Clock,
      title: "Time Reclaimed",
      description: "See exactly how much time AI saves you from planning and decision-making each week.",
    },
    {
      icon: Zap,
      title: "Drag & Drop Scheduling",
      description: "Quickly reschedule with smart conflict detection. AI warns you before you overbook.",
    },
    {
      icon: BarChart3,
      title: "AI Transparency Dashboard",
      description: "See what your AI learned, why it makes suggestions, and control what it remembers.",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Take Back Control{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
              of Your Time
            </span>
          </h1>

          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            Stop drowning in decisions about when to do what. ResolutionAI eliminates scheduling
            stress, protects your focus time, and balances work with life admin. Let AI handle
            the mental load so you can finally be productive without the burnout.
          </p>

          <Button
            size="lg"
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-lg px-8 py-6"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          >
            Get Started with Google
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>

          <p className="mt-4 text-sm text-gray-500">
            Free to use. Syncs with Google Calendar. Import work calendars.
          </p>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">
          Built for Busy People Who Want Balance
        </h2>
        <p className="text-gray-600 text-center max-w-2xl mx-auto mb-12">
          Not just another to-do app. ResolutionAI actively manages your time, protects your energy, and makes productivity sustainable.
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card key={index} className="border-none shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="pt-6">
                <div className="w-12 h-12 bg-gradient-to-r from-blue-100 to-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* How It Works Section */}
      <div className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">
            How It Works
          </h2>

          <div className="grid md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                1
              </div>
              <h3 className="text-xl font-semibold mb-2">Connect Calendars</h3>
              <p className="text-gray-600">
                Import work and personal calendars. AI instantly sees where your time goes.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-purple-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="text-xl font-semibold mb-2">Add What Matters</h3>
              <p className="text-gray-600">
                Tell AI your goals and life admin. &quot;Weekly planning&quot;, &quot;Inbox zero&quot;, &quot;Meal prep&quot;.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-green-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="text-xl font-semibold mb-2">AI Optimizes</h3>
              <p className="text-gray-600">
                AI finds the best times, protects focus blocks, and balances your workload automatically.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-orange-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                4
              </div>
              <h3 className="text-xl font-semibold mb-2">Reclaim Your Time</h3>
              <p className="text-gray-600">
                Stop stressing about scheduling. Focus on doing, not deciding when to do.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Capabilities */}
      <div className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">
            Plus Powerful Tools
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {capabilities.map((cap, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <cap.icon className="w-8 h-8 text-gray-700" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{cap.title}</h3>
                <p className="text-gray-600">{cap.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Social Proof */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center text-white">
          <h2 className="text-3xl font-bold mb-8">
            AI That Learns Your Productivity Style
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <div className="text-4xl font-bold mb-2">2hrs+</div>
              <div className="text-blue-100">Planning Time Saved Weekly</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">85%</div>
              <div className="text-blue-100">Tasks Completed On Schedule</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">0</div>
              <div className="text-blue-100">Decisions About When To Do What</div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Stop Drowning in Decisions?
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Let AI handle the mental load of scheduling so you can focus on actually getting things done.
          </p>
          <Button
            size="lg"
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          >
            Start Free with Google
          </Button>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex justify-center items-center gap-2 mb-4">
            <Sparkles className="w-6 h-6" />
            <span className="text-xl font-semibold">ResolutionAI</span>
          </div>
          <p className="text-sm text-gray-500">
            &copy; 2026 ResolutionAI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
