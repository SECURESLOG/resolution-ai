"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  RotateCcw,
  Coffee,
  Brain,
  Sparkles,
  Volume2,
  VolumeX,
  Settings,
  CheckCircle,
} from "lucide-react";
import { useRegisterPageContext } from "@/contexts/AIAssistantContext";

type TimerMode = "focus" | "shortBreak" | "longBreak";

interface TimerSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  sessionsBeforeLongBreak: number;
}

const DEFAULT_SETTINGS: TimerSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsBeforeLongBreak: 4,
};

export default function FocusPage() {
  const [settings, setSettings] = useState<TimerSettings>(DEFAULT_SETTINGS);
  const [mode, setMode] = useState<TimerMode>("focus");
  const [timeLeft, setTimeLeft] = useState(settings.focusMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Register page context for AI assistant
  useRegisterPageContext("/focus", "Focus Timer", {
    currentMode: mode,
    isRunning,
    completedSessions,
    timeLeft,
  }, [
    "How's my calendar looking?",
    "When should I take a break?",
    "What task should I focus on?",
  ]);

  // Initialize audio
  useEffect(() => {
    audioRef.current = new Audio("/notification.mp3");
    // Fallback to a simple beep if the file doesn't exist
    audioRef.current.onerror = () => {
      audioRef.current = null;
    };
  }, []);

  // Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      // Timer completed
      handleTimerComplete();
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, timeLeft]);

  const handleTimerComplete = useCallback(() => {
    setIsRunning(false);

    // Play sound
    if (soundEnabled && audioRef.current) {
      audioRef.current.play().catch(() => {});
    }

    if (mode === "focus") {
      const newCompletedSessions = completedSessions + 1;
      setCompletedSessions(newCompletedSessions);

      // Determine next break type
      if (newCompletedSessions % settings.sessionsBeforeLongBreak === 0) {
        setMode("longBreak");
        setTimeLeft(settings.longBreakMinutes * 60);
      } else {
        setMode("shortBreak");
        setTimeLeft(settings.shortBreakMinutes * 60);
      }

      // Fetch AI suggestion for break
      fetchAiSuggestion("break");
    } else {
      // Break completed, back to focus
      setMode("focus");
      setTimeLeft(settings.focusMinutes * 60);
      fetchAiSuggestion("focus");
    }
  }, [mode, completedSessions, settings, soundEnabled]);

  const fetchAiSuggestion = async (context: "break" | "focus") => {
    setLoadingSuggestion(true);
    try {
      const res = await fetch("/api/focus/suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, completedSessions }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiSuggestion(data.suggestion);
      }
    } catch (error) {
      console.error("Error fetching suggestion:", error);
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const toggleTimer = () => {
    setIsRunning(!isRunning);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setMode("focus");
    setTimeLeft(settings.focusMinutes * 60);
    setAiSuggestion(null);
  };

  const switchMode = (newMode: TimerMode) => {
    setIsRunning(false);
    setMode(newMode);
    switch (newMode) {
      case "focus":
        setTimeLeft(settings.focusMinutes * 60);
        break;
      case "shortBreak":
        setTimeLeft(settings.shortBreakMinutes * 60);
        break;
      case "longBreak":
        setTimeLeft(settings.longBreakMinutes * 60);
        break;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getProgressPercent = () => {
    const totalSeconds =
      mode === "focus"
        ? settings.focusMinutes * 60
        : mode === "shortBreak"
        ? settings.shortBreakMinutes * 60
        : settings.longBreakMinutes * 60;
    return ((totalSeconds - timeLeft) / totalSeconds) * 100;
  };

  const getModeColor = () => {
    switch (mode) {
      case "focus":
        return "from-blue-600 to-purple-600";
      case "shortBreak":
        return "from-green-500 to-teal-500";
      case "longBreak":
        return "from-orange-500 to-yellow-500";
    }
  };

  const getModeIcon = () => {
    switch (mode) {
      case "focus":
        return <Brain className="h-8 w-8" />;
      case "shortBreak":
      case "longBreak":
        return <Coffee className="h-8 w-8" />;
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Focus Timer</h1>
        <p className="text-gray-600 mt-1">Stay focused with the Pomodoro technique</p>
      </div>

      {/* Mode Tabs */}
      <div className="flex justify-center gap-2">
        <Button
          variant={mode === "focus" ? "default" : "outline"}
          onClick={() => switchMode("focus")}
          className={mode === "focus" ? "bg-blue-600 hover:bg-blue-700" : ""}
        >
          <Brain className="h-4 w-4 mr-2" />
          Focus
        </Button>
        <Button
          variant={mode === "shortBreak" ? "default" : "outline"}
          onClick={() => switchMode("shortBreak")}
          className={mode === "shortBreak" ? "bg-green-600 hover:bg-green-700" : ""}
        >
          <Coffee className="h-4 w-4 mr-2" />
          Short Break
        </Button>
        <Button
          variant={mode === "longBreak" ? "default" : "outline"}
          onClick={() => switchMode("longBreak")}
          className={mode === "longBreak" ? "bg-orange-600 hover:bg-orange-700" : ""}
        >
          <Coffee className="h-4 w-4 mr-2" />
          Long Break
        </Button>
      </div>

      {/* Timer Display */}
      <Card className="overflow-hidden">
        <div className={`h-2 bg-gradient-to-r ${getModeColor()}`} style={{ width: `${getProgressPercent()}%` }} />
        <CardContent className="pt-8 pb-8">
          <div className="text-center">
            {/* Timer Circle */}
            <div className="relative inline-flex items-center justify-center mb-6">
              <div
                className={`w-64 h-64 rounded-full bg-gradient-to-br ${getModeColor()} p-1`}
              >
                <div className="w-full h-full rounded-full bg-white flex flex-col items-center justify-center">
                  <div className="text-gray-400 mb-2">{getModeIcon()}</div>
                  <p className="text-6xl font-bold text-gray-900 font-mono">
                    {formatTime(timeLeft)}
                  </p>
                  <p className="text-sm text-gray-500 mt-2 capitalize">
                    {mode === "focus" ? "Focus Time" : mode === "shortBreak" ? "Short Break" : "Long Break"}
                  </p>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={resetTimer}
                title="Reset"
              >
                <RotateCcw className="h-5 w-5" />
              </Button>

              <Button
                size="lg"
                onClick={toggleTimer}
                className={`w-32 bg-gradient-to-r ${getModeColor()} hover:opacity-90`}
              >
                {isRunning ? (
                  <>
                    <Pause className="h-5 w-5 mr-2" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5 mr-2" />
                    Start
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={() => setSoundEnabled(!soundEnabled)}
                title={soundEnabled ? "Mute" : "Unmute"}
              >
                {soundEnabled ? (
                  <Volume2 className="h-5 w-5" />
                ) : (
                  <VolumeX className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Suggestion */}
      {(aiSuggestion || loadingSuggestion) && (
        <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-medium text-purple-600 uppercase tracking-wide mb-1">
                  AI Suggestion
                </p>
                {loadingSuggestion ? (
                  <p className="text-gray-500 text-sm">Thinking...</p>
                ) : (
                  <p className="text-gray-700 text-sm">{aiSuggestion}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
              <CheckCircle className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold">{completedSessions}</p>
            <p className="text-xs text-gray-500">Sessions Today</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="flex items-center justify-center gap-1 text-blue-600 mb-1">
              <Brain className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold">{completedSessions * settings.focusMinutes}</p>
            <p className="text-xs text-gray-500">Minutes Focused</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="flex items-center justify-center gap-1 text-purple-600 mb-1">
              <Coffee className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold">
              {settings.sessionsBeforeLongBreak - (completedSessions % settings.sessionsBeforeLongBreak)}
            </p>
            <p className="text-xs text-gray-500">Until Long Break</p>
          </CardContent>
        </Card>
      </div>

      {/* Settings Card */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => setShowSettings(!showSettings)}
        >
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Timer Settings</CardTitle>
              <CardDescription>Customize your focus sessions</CardDescription>
            </div>
            <Settings className={`h-5 w-5 text-gray-400 transition-transform ${showSettings ? "rotate-90" : ""}`} />
          </div>
        </CardHeader>
        {showSettings && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Focus (minutes)</label>
                <input
                  type="number"
                  value={settings.focusMinutes}
                  onChange={(e) =>
                    setSettings({ ...settings, focusMinutes: parseInt(e.target.value) || 25 })
                  }
                  className="mt-1 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="1"
                  max="60"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Short Break (minutes)</label>
                <input
                  type="number"
                  value={settings.shortBreakMinutes}
                  onChange={(e) =>
                    setSettings({ ...settings, shortBreakMinutes: parseInt(e.target.value) || 5 })
                  }
                  className="mt-1 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="1"
                  max="30"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Long Break (minutes)</label>
                <input
                  type="number"
                  value={settings.longBreakMinutes}
                  onChange={(e) =>
                    setSettings({ ...settings, longBreakMinutes: parseInt(e.target.value) || 15 })
                  }
                  className="mt-1 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="1"
                  max="60"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Sessions before long break</label>
                <input
                  type="number"
                  value={settings.sessionsBeforeLongBreak}
                  onChange={(e) =>
                    setSettings({ ...settings, sessionsBeforeLongBreak: parseInt(e.target.value) || 4 })
                  }
                  className="mt-1 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="1"
                  max="10"
                />
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setSettings(DEFAULT_SETTINGS);
                resetTimer();
              }}
              className="w-full"
            >
              Reset to Defaults
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
