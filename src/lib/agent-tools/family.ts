/**
 * Family Tools for AI Agents
 *
 * These tools allow agents to access family member information
 * and analyze task distribution for fairness.
 */

import prisma from "@/lib/prisma";
import { startOfWeek, endOfWeek, subWeeks } from "date-fns";

interface FamilyMemberInfo {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
}

interface FamilyInfo {
  id: string;
  name: string;
  members: FamilyMemberInfo[];
}

interface TaskDistribution {
  userId: string;
  userName: string | null;
  totalTasks: number;
  completedTasks: number;
  resolutionTasks: number;
  householdTasks: number;
  totalMinutes: number;
}

interface FairnessAnalysis {
  distributions: TaskDistribution[];
  fairnessScore: number; // 0-1, 1 being perfectly fair
  recommendation: string;
  imbalance?: {
    overloadedMember: string;
    underloadedMember: string;
    difference: number;
  };
}

/**
 * Get family information for a user
 */
export async function getFamilyForUser(userId: string): Promise<FamilyInfo | null> {
  const membership = await prisma.familyMember.findUnique({
    where: { userId },
    include: {
      family: {
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!membership) return null;

  return {
    id: membership.family.id,
    name: membership.family.name,
    members: membership.family.members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
      role: m.role,
    })),
  };
}

/**
 * Get all family member user IDs
 */
export async function getFamilyMemberIds(userId: string): Promise<string[]> {
  const family = await getFamilyForUser(userId);
  if (!family) return [userId];
  return family.members.map((m) => m.userId);
}

/**
 * Check if two users are in the same family
 */
export async function areInSameFamily(userId1: string, userId2: string): Promise<boolean> {
  const family1 = await getFamilyForUser(userId1);
  const family2 = await getFamilyForUser(userId2);

  if (!family1 || !family2) return false;
  return family1.id === family2.id;
}

/**
 * Get task distribution across family members for a time period
 */
export async function getTaskDistribution(
  familyId: string,
  startDate: Date,
  endDate: Date
): Promise<TaskDistribution[]> {
  const members = await prisma.familyMember.findMany({
    where: { familyId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const distributions: TaskDistribution[] = [];

  for (const member of members) {
    const scheduledTasks = await prisma.scheduledTask.findMany({
      where: {
        assignedToUserId: member.userId,
        scheduledDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        task: true,
      },
    });

    const dist: TaskDistribution = {
      userId: member.userId,
      userName: member.user.name,
      totalTasks: scheduledTasks.length,
      completedTasks: scheduledTasks.filter((t) => t.status === "completed").length,
      resolutionTasks: scheduledTasks.filter((t) => t.task.type === "resolution").length,
      householdTasks: scheduledTasks.filter((t) => t.task.type === "household").length,
      totalMinutes: scheduledTasks.reduce((sum, t) => sum + t.task.duration, 0),
    };

    distributions.push(dist);
  }

  return distributions;
}

/**
 * Analyze fairness of task distribution
 */
export async function analyzeFairness(
  familyId: string,
  weeksToAnalyze: number = 4
): Promise<FairnessAnalysis> {
  const endDate = endOfWeek(new Date(), { weekStartsOn: 1 });
  const startDate = startOfWeek(subWeeks(endDate, weeksToAnalyze - 1), { weekStartsOn: 1 });

  const distributions = await getTaskDistribution(familyId, startDate, endDate);

  if (distributions.length < 2) {
    return {
      distributions,
      fairnessScore: 1,
      recommendation: "Not enough family members to analyze fairness.",
    };
  }

  // Calculate fairness based on household task minutes (resolutions are personal)
  const householdMinutes = distributions.map((d) => {
    // Calculate approximate household minutes
    return d.householdTasks * 30; // Assuming average 30 min per household task
  });

  const totalHouseholdMinutes = householdMinutes.reduce((a, b) => a + b, 0);
  const avgMinutes = totalHouseholdMinutes / distributions.length;

  // Calculate standard deviation
  const variance =
    householdMinutes.reduce((sum, m) => sum + Math.pow(m - avgMinutes, 2), 0) /
    distributions.length;
  const stdDev = Math.sqrt(variance);

  // Fairness score: 1 when stdDev is 0, approaches 0 as imbalance grows
  const fairnessScore = avgMinutes > 0 ? Math.max(0, 1 - stdDev / avgMinutes) : 1;

  // Find imbalance
  let recommendation = "";
  let imbalance = undefined;

  if (fairnessScore < 0.7 && distributions.length === 2) {
    const sorted = [...distributions].sort((a, b) => b.householdTasks - a.householdTasks);
    const overloaded = sorted[0];
    const underloaded = sorted[1];

    imbalance = {
      overloadedMember: overloaded.userName || "Member 1",
      underloadedMember: underloaded.userName || "Member 2",
      difference: overloaded.householdTasks - underloaded.householdTasks,
    };

    recommendation = `${overloaded.userName || "One member"} has been assigned ${
      imbalance.difference
    } more household tasks than ${
      underloaded.userName || "the other member"
    } over the past ${weeksToAnalyze} weeks. Consider assigning more tasks to ${
      underloaded.userName || "the other member"
    } for better balance.`;
  } else if (fairnessScore >= 0.7) {
    recommendation = "Task distribution is fairly balanced between family members.";
  }

  return {
    distributions,
    fairnessScore,
    recommendation,
    imbalance,
  };
}

/**
 * Get the best family member to assign a task to based on fairness
 */
export async function suggestTaskAssignment(
  familyId: string,
  taskType: "resolution" | "household"
): Promise<string | null> {
  // For resolutions, they're personal - no suggestion needed
  if (taskType === "resolution") {
    return null;
  }

  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const thisWeekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const distributions = await getTaskDistribution(familyId, thisWeekStart, thisWeekEnd);

  if (distributions.length < 2) {
    return distributions[0]?.userId || null;
  }

  // Find member with fewer household tasks this week
  const sorted = [...distributions].sort((a, b) => a.householdTasks - b.householdTasks);
  return sorted[0].userId;
}

/**
 * Format family info for AI context
 */
export function formatFamilyForAI(family: FamilyInfo | null): string {
  if (!family) {
    return "User is not part of a family.";
  }

  const membersList = family.members
    .map((m) => `- ${m.name || m.email || "Unknown"} (${m.role})`)
    .join("\n");

  return `Family: ${family.name}\nMembers:\n${membersList}`;
}

/**
 * Format task distribution for AI context
 */
export function formatDistributionForAI(distributions: TaskDistribution[]): string {
  return distributions
    .map(
      (d) =>
        `${d.userName || "Unknown"}: ${d.totalTasks} tasks (${d.completedTasks} completed), ` +
        `${d.householdTasks} household, ${d.resolutionTasks} resolutions, ${d.totalMinutes} total minutes`
    )
    .join("\n");
}
