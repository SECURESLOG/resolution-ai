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
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Clock,
  Zap,
  Star,
  ThumbsUp,
  ThumbsDown,
  CloudRain,
  Car,
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
type EnergyLevel = "low" | "medium" | "high";

export function TaskFeedbackModal({
  isOpen,
  onClose,
  scheduledTaskId,
  taskName,
  estimatedDuration,
  onFeedbackSubmitted,
}: TaskFeedbackModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [actualDuration, setActualDuration] = useState(estimatedDuration.toString());
  const [timeAccuracy, setTimeAccuracy] = useState<TimeAccuracy>("just_right");
  const [timeSlotRating, setTimeSlotRating] = useState(4);
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel>("medium");
  const [trafficImpact, setTrafficImpact] = useState<boolean | null>(null);
  const [weatherImpact, setWeatherImpact] = useState<boolean | null>(null);
  const [notes, setNotes] = useState("");

  const handleSubmit = async () => {
    try {
      setSubmitting(true);

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledTaskId,
          actualDuration: parseInt(actualDuration) || estimatedDuration,
          timeAccuracy,
          timeSlotRating,
          energyLevel,
          trafficImpact,
          weatherImpact,
          notes: notes.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error("Feedback submission error:", data.error);
      }

      // Always close modal and notify parent after attempt
      onFeedbackSubmitted?.();
      onClose();
    } catch (error) {
      console.error("Error submitting feedback:", error);
      // Still close on network errors
      onFeedbackSubmitted?.();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    onFeedbackSubmitted?.();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>How did it go?</DialogTitle>
          <DialogDescription>
            Quick feedback on "{taskName}" helps improve your schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Actual Duration */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              Actual Duration
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={actualDuration}
                onChange={(e) => setActualDuration(e.target.value)}
                className="w-24"
                min="1"
              />
              <span className="text-sm text-gray-500">
                minutes (estimated: {estimatedDuration})
              </span>
            </div>
          </div>

          {/* Time Accuracy */}
          <div className="space-y-2">
            <Label>Was the time estimate accurate?</Label>
            <div className="flex gap-2">
              {[
                { value: "too_short", label: "Too Short", icon: "⏱️" },
                { value: "just_right", label: "Just Right", icon: "✓" },
                { value: "too_long", label: "Too Long", icon: "⏳" },
              ].map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={timeAccuracy === option.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTimeAccuracy(option.value as TimeAccuracy)}
                  className="flex-1"
                >
                  <span className="mr-1">{option.icon}</span>
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Time Slot Rating */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Star className="h-4 w-4 text-gray-500" />
              How was this time slot? (1-5)
            </Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((rating) => (
                <Button
                  key={rating}
                  type="button"
                  variant={timeSlotRating >= rating ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTimeSlotRating(rating)}
                  className={`w-10 h-10 p-0 ${
                    timeSlotRating >= rating
                      ? "bg-yellow-500 hover:bg-yellow-600 border-yellow-500"
                      : ""
                  }`}
                >
                  <Star
                    className={`h-5 w-5 ${
                      timeSlotRating >= rating ? "fill-white text-white" : ""
                    }`}
                  />
                </Button>
              ))}
            </div>
          </div>

          {/* Energy Level */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-gray-500" />
              Your energy level during this task
            </Label>
            <div className="flex gap-2">
              {[
                { value: "low", label: "Low", color: "text-red-500" },
                { value: "medium", label: "Medium", color: "text-yellow-500" },
                { value: "high", label: "High", color: "text-green-500" },
              ].map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={energyLevel === option.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setEnergyLevel(option.value as EnergyLevel)}
                  className="flex-1"
                >
                  <Zap
                    className={`h-4 w-4 mr-1 ${
                      energyLevel === option.value ? "" : option.color
                    }`}
                  />
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Context Impact (Optional) */}
          <div className="space-y-3">
            <Label className="text-sm text-gray-500">
              Did any of these affect your task? (Optional)
            </Label>
            <div className="flex gap-4">
              {/* Traffic */}
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-gray-400" />
                <span className="text-sm">Traffic</span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant={trafficImpact === false ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTrafficImpact(trafficImpact === false ? null : false)}
                    className="h-7 w-7 p-0"
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant={trafficImpact === true ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => setTrafficImpact(trafficImpact === true ? null : true)}
                    className="h-7 w-7 p-0"
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Weather */}
              <div className="flex items-center gap-2">
                <CloudRain className="h-4 w-4 text-gray-400" />
                <span className="text-sm">Weather</span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant={weatherImpact === false ? "default" : "outline"}
                    size="sm"
                    onClick={() => setWeatherImpact(weatherImpact === false ? null : false)}
                    className="h-7 w-7 p-0"
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant={weatherImpact === true ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => setWeatherImpact(weatherImpact === true ? null : true)}
                    className="h-7 w-7 p-0"
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-sm text-gray-500">
              Any notes? (Optional)
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Got interrupted, felt great afterwards..."
              className="h-16 resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={handleSkip} disabled={submitting}>
            Skip
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Feedback
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
