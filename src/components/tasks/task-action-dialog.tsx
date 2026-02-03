"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Brain, Lightbulb, Check } from "lucide-react";

interface TaskActionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  taskName: string;
  action: "complete" | "skip";
  onConfirm: (learningEnabled: boolean) => void;
}

export function TaskActionDialog({
  isOpen,
  onClose,
  taskName,
  action,
  onConfirm,
}: TaskActionDialogProps) {
  const [learningEnabled, setLearningEnabled] = useState(true);

  const handleConfirm = () => {
    onConfirm(learningEnabled);
    onClose();
    // Reset for next time
    setLearningEnabled(true);
  };

  const isComplete = action === "complete";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isComplete ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <XCircle className="h-5 w-5 text-orange-600" />
            )}
            {isComplete ? "Complete Task" : "Skip Task"}
          </DialogTitle>
          <DialogDescription>
            {isComplete
              ? `Mark "${taskName}" as completed?`
              : `Skip "${taskName}" for now?`}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* AI Learning Toggle */}
          <div className="flex items-start space-x-3 p-4 bg-purple-50 rounded-lg border border-purple-100">
            <Brain className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <button
                type="button"
                onClick={() => setLearningEnabled(!learningEnabled)}
                className="flex items-center space-x-2 group"
              >
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    learningEnabled
                      ? "bg-purple-600 border-purple-600"
                      : "bg-white border-gray-300 group-hover:border-purple-400"
                  }`}
                >
                  {learningEnabled && <Check className="h-3 w-3 text-white" />}
                </div>
                <span className="text-sm font-medium">Help AI learn from this</span>
              </button>
              <p className="text-xs text-purple-700 mt-2">
                {learningEnabled ? (
                  isComplete ? (
                    <>
                      <Lightbulb className="inline h-3 w-3 mr-1" />
                      AI will learn that this time slot works well for you
                    </>
                  ) : (
                    <>
                      <Lightbulb className="inline h-3 w-3 mr-1" />
                      AI will learn to avoid this time slot in the future
                    </>
                  )
                ) : (
                  "One-time action - AI won't learn from this (e.g., you're sick today)"
                )}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            className={isComplete ? "bg-green-600 hover:bg-green-700" : "bg-orange-600 hover:bg-orange-700"}
          >
            {isComplete ? "Complete" : "Skip"}
            {!learningEnabled && " (No Learning)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
