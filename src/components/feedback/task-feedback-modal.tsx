"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Clock,
  Star,
  CloudRain,
  Car,
  Battery,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
} from "lucide-react";

interface TaskFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  scheduledTaskId: string;
  taskName: string;
  estimatedDuration: number;
  onFeedbackSubmitted?: () => void;
}

type TimeAccuracy = "too_short" | "just_right" | "too_long";
type RescheduleOption = "earlier" | "later" | "different_day" | "no";
type PreferredTime = "morning" | "afternoon" | "evening" | "weekend";
type EnergyLevel = "low" | "medium" | "high";

export function TaskFeedbackModal({
  isOpen,
  onClose,
  scheduledTaskId,
  taskName,
  estimatedDuration,
  onFeedbackSubmitted,
}: TaskFeedbackModalProps) {
  const [timeAccuracy, setTimeAccuracy] = useState<TimeAccuracy | null>(null);
  const [actualDuration, setActualDuration] = useState<number | undefined>(undefined);
  const [rating, setRating] = useState<number>(0);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [trafficImpact, setTrafficImpact] = useState(false);
  const [weatherImpact, setWeatherImpact] = useState(false);
  const [wouldReschedule, setWouldReschedule] = useState<RescheduleOption | null>(null);
  const [preferredTime, setPreferredTime] = useState<PreferredTime | null>(null);
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        scheduledTaskId,
        actualDuration: actualDuration || undefined,
        timeAccuracy: timeAccuracy || undefined,
        timeSlotRating: rating || undefined,
        wouldReschedule: wouldReschedule || undefined,
        preferredTime: preferredTime || undefined,
        trafficImpact: trafficImpact || undefined,
        weatherImpact: weatherImpact || undefined,
        energyLevel: energyLevel || undefined,
        notes: notes || undefined,
      };

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();

      if (response.ok) {
        setSubmitted(true);
        setTimeout(() => {
          onClose();
          onFeedbackSubmitted?.();
        }, 1500);
      } else {
        setError(responseData.error || `Error ${response.status}: Failed to submit feedback`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error - please try again");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    onClose();
    onFeedbackSubmitted?.();
  };

  if (submitted) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[400px]">
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900">Thanks for your feedback!</h3>
            <p className="text-sm text-gray-500 mt-1">This helps improve your future schedules.</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>How was your task?</DialogTitle>
          <DialogDescription>
            Quick feedback on &quot;{taskName}&quot; helps AI schedule better.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Time Accuracy */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              Time allocated ({estimatedDuration} min)
            </Label>
            <div className="flex gap-2">
              {(["too_short", "just_right", "too_long"] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setTimeAccuracy(option)}
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                    timeAccuracy === option
                      ? option === "just_right"
                        ? "bg-green-100 border-green-500 text-green-700"
                        : "bg-blue-100 border-blue-500 text-blue-700"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {option === "too_short" && "Too short"}
                  {option === "just_right" && "Just right"}
                  {option === "too_long" && "Too long"}
                </button>
              ))}
            </div>
            {timeAccuracy && timeAccuracy !== "just_right" && (
              <div className="flex items-center gap-2 mt-2">
                <Label htmlFor="actualDuration" className="text-sm text-gray-500 whitespace-nowrap">
                  Actual time:
                </Label>
                <Input
                  id="actualDuration"
                  type="number"
                  placeholder="minutes"
                  className="w-24"
                  value={actualDuration || ""}
                  onChange={(e) => setActualDuration(parseInt(e.target.value) || undefined)}
                />
                <span className="text-sm text-gray-500">min</span>
              </div>
            )}
          </div>

          {/* Star Rating */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Star className="h-4 w-4 text-gray-500" />
              How was this time slot?
            </Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={`h-8 w-8 ${
                      star <= rating
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-gray-300"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* More Options Toggle */}
          <button
            onClick={() => setShowMoreOptions(!showMoreOptions)}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
          >
            {showMoreOptions ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Hide additional options
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                More feedback options
              </>
            )}
          </button>

          {/* Extended Options */}
          {showMoreOptions && (
            <div className="space-y-4 border-t pt-4">
              {/* Context Impacts */}
              <div className="space-y-2">
                <Label className="text-sm text-gray-600">Did any of these affect your task?</Label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTrafficImpact(!trafficImpact)}
                    className={`flex items-center gap-2 py-2 px-3 rounded-lg border text-sm transition-colors ${
                      trafficImpact
                        ? "bg-orange-100 border-orange-500 text-orange-700"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <Car className="h-4 w-4" />
                    Traffic
                  </button>
                  <button
                    onClick={() => setWeatherImpact(!weatherImpact)}
                    className={`flex items-center gap-2 py-2 px-3 rounded-lg border text-sm transition-colors ${
                      weatherImpact
                        ? "bg-blue-100 border-blue-500 text-blue-700"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <CloudRain className="h-4 w-4" />
                    Weather
                  </button>
                </div>
              </div>

              {/* Energy Level */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm text-gray-600">
                  <Battery className="h-4 w-4" />
                  Your energy level during this task
                </Label>
                <div className="flex gap-2">
                  {(["low", "medium", "high"] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => setEnergyLevel(level)}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        energyLevel === level
                          ? level === "high"
                            ? "bg-green-100 border-green-500 text-green-700"
                            : level === "medium"
                            ? "bg-yellow-100 border-yellow-500 text-yellow-700"
                            : "bg-red-100 border-red-500 text-red-700"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reschedule Preference */}
              <div className="space-y-2">
                <Label className="text-sm text-gray-600">Would you prefer a different time?</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["no", "earlier", "later", "different_day"] as const).map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setWouldReschedule(option);
                        if (option === "no") setPreferredTime(null);
                      }}
                      className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        wouldReschedule === option
                          ? "bg-purple-100 border-purple-500 text-purple-700"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {option === "no" && "No, this was good"}
                      {option === "earlier" && "Earlier in day"}
                      {option === "later" && "Later in day"}
                      {option === "different_day" && "Different day"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preferred Time */}
              {wouldReschedule && wouldReschedule !== "no" && (
                <div className="space-y-2">
                  <Label className="text-sm text-gray-600">When would be better?</Label>
                  <div className="flex flex-wrap gap-2">
                    {(["morning", "afternoon", "evening", "weekend"] as const).map((time) => (
                      <button
                        key={time}
                        onClick={() => setPreferredTime(time)}
                        className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                          preferredTime === time
                            ? "bg-indigo-100 border-indigo-500 text-indigo-700"
                            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {time.charAt(0).toUpperCase() + time.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes" className="text-sm text-gray-600">
                  Any other feedback?
                </Label>
                <textarea
                  id="notes"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="Optional notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={handleSkip}>
            Skip
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Feedback"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
