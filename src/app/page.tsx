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
      title: "AI Assistant",
      description: "Chat naturally to schedule tasks, resolve conflicts, and get personalized recommendations.",
    },
    {
      icon: Brain,
      title: "Learns Your Patterns",
      description: "AI learns from your feedback - your energy levels, preferred times, and task completion patterns.",
    },
    {
      icon: Calendar,
      title: "Smart Scheduling",
      description: "Automatically finds optimal time slots based on your calendar, preferences, and energy patterns.",
    },
    {
      icon: Users,
      title: "Family Coordination",
      description: "Fair task distribution between family members with workload balancing and conflict detection.",
    },
    {
      icon: TrendingUp,
      title: "Weekly Planning",
      description: "AI-generated weekly plans that adapt to your schedule and priorities.",
    },
    {
      icon: Heart,
      title: "Burnout Prevention",
      description: "Monitors your workload and suggests rest when you're at risk of burnout.",
    },
  ];

  const capabilities = [
    {
      icon: Clock,
      title: "Focus Timer",
      description: "Built-in Pomodoro timer with AI-suggested focus sessions based on your task priorities.",
    },
    {
      icon: Zap,
      title: "Smart Reminders",
      description: "Context-aware reminders that consider traffic, weather, and your patterns.",
    },
    {
      icon: BarChart3,
      title: "Your AI - Full Transparency",
      description: "See exactly what your AI learns, control what it remembers, and watch it improve over time.",
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
            Your AI-Powered{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
              Resolution Partner
            </span>
          </h1>

          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            ResolutionAI learns your patterns, understands your energy levels, and intelligently schedules
            your goals around your busy life. Chat with AI to manage tasks, prevent burnout, and finally
            achieve your New Year resolutions.
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
          AI That Actually Understands You
        </h2>
        <p className="text-gray-600 text-center max-w-2xl mx-auto mb-12">
          Not just another scheduling app. ResolutionAI learns from every interaction to become your personal productivity partner.
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
              <h3 className="text-xl font-semibold mb-2">Connect</h3>
              <p className="text-gray-600">
                Sign in with Google and import your calendars. AI sees your availability instantly.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-purple-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="text-xl font-semibold mb-2">Tell AI Your Goals</h3>
              <p className="text-gray-600">
                Chat naturally: &quot;Schedule gym 3x this week&quot; or &quot;Find time for reading&quot;.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-green-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="text-xl font-semibold mb-2">AI Learns</h3>
              <p className="text-gray-600">
                Give feedback after tasks. AI learns your energy patterns and optimal times.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-orange-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                4
              </div>
              <h3 className="text-xl font-semibold mb-2">Achieve More</h3>
              <p className="text-gray-600">
                Watch your completion rates improve as AI optimizes your schedule over time.
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
            The AI That Gets Smarter With You
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <div className="text-4xl font-bold mb-2">6+</div>
              <div className="text-blue-100">Learned Preferences Per User</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">85%</div>
              <div className="text-blue-100">Schedule Adherence Rate</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">24/7</div>
              <div className="text-blue-100">AI Assistant Available</div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Finally Achieve Your Goals?
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Let AI handle the scheduling so you can focus on what matters most.
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
