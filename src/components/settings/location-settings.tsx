"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPin, Plus, Trash2, Loader2, CheckCircle } from "lucide-react";

interface SavedLocation {
  type: string;
  label: string;
  address: string;
}

const LOCATION_TYPES = [
  { value: "home", label: "Home", icon: "🏠" },
  { value: "work", label: "Work", icon: "💼" },
  { value: "gym", label: "Gym", icon: "🏋️" },
  { value: "school", label: "School", icon: "🎓" },
  { value: "other", label: "Other", icon: "📍" },
];

export function LocationSettings() {
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // New location form
  const [newType, setNewType] = useState<string>("");
  const [newLabel, setNewLabel] = useState("");
  const [newAddress, setNewAddress] = useState("");

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      const response = await fetch("/api/user/locations");
      const data = await response.json();
      if (response.ok) {
        setLocations(data.locations || []);
      }
    } catch (error) {
      console.error("Error fetching locations:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveLocation = async () => {
    if (!newType || !newAddress) return;

    try {
      setSaving(true);
      const response = await fetch("/api/user/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newType,
          label: newLabel || LOCATION_TYPES.find((t) => t.value === newType)?.label,
          address: newAddress,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setMessage(data.message);
        setNewType("");
        setNewLabel("");
        setNewAddress("");
        fetchLocations();
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error("Error saving location:", error);
    } finally {
      setSaving(false);
    }
  };

  const deleteLocation = async (type: string) => {
    try {
      const response = await fetch(`/api/user/locations?type=${type}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setLocations((prev) => prev.filter((l) => l.type !== type));
        setMessage("Location removed");
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error("Error deleting location:", error);
    }
  };

  const getLocationIcon = (type: string) => {
    return LOCATION_TYPES.find((t) => t.value === type)?.icon || "📍";
  };

  // Filter out already saved location types
  const availableTypes = LOCATION_TYPES.filter(
    (t) => !locations.some((l) => l.type === t.value) || t.value === "other"
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Saved Locations
        </CardTitle>
        <CardDescription>
          Add your frequently visited locations for accurate traffic estimates in reminders.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {message && (
          <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg">
            <CheckCircle className="h-4 w-4" />
            {message}
          </div>
        )}

        {/* Existing locations */}
        {locations.length > 0 && (
          <div className="space-y-3">
            {locations.map((location) => (
              <div
                key={location.type}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getLocationIcon(location.type)}</span>
                  <div>
                    <p className="font-medium">{location.label}</p>
                    <p className="text-sm text-gray-500">{location.address}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteLocation(location.type)}
                >
                  <Trash2 className="h-4 w-4 text-gray-400" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add new location form */}
        <div className="border-t pt-4">
          <h4 className="font-medium mb-3">Add a Location</h4>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="locationType">Type</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger id="locationType">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.icon} {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="locationLabel">Label (optional)</Label>
                <Input
                  id="locationLabel"
                  placeholder="e.g., Downtown Gym"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="locationAddress">Address</Label>
              <Input
                id="locationAddress"
                placeholder="e.g., 123 Main Street, City, Country"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter a full address for accurate traffic calculations
              </p>
            </div>
            <Button
              onClick={saveLocation}
              disabled={!newType || !newAddress || saving}
              className="w-full sm:w-auto"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Add Location
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
