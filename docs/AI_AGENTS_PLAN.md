# ResolutionAI - AI Agents Implementation Plan

> **Status**: In Progress
> **Last Updated**: 2026-01-31
> **Current Phase**: Phase 2 Complete - Ready for Phase 3 (Interactive Agent)

---

## Overview

Building an AI agent system for family scheduling with the following capabilities:
- Natural language task scheduling
- Proactive schedule optimization
- Smart context-aware reminders
- Conflict mediation between family members
- Weekly planning automation
- Continuous learning from user feedback

---

## Architecture

### Agent Grouping

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FAMILY AI SYSTEM                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  INTERACTIVE AGENT (Single)                                         │
│  - Natural Language Scheduler                                       │
│  - Conflict Mediator                                                │
│  - On-Demand Schedule Optimizer                                     │
│  → User chats → Agent reasons → Uses tools → Returns response       │
│                                                                     │
│  BACKGROUND WORKERS (Separate)                                      │
│  - Weekly Planning Agent (Cron: Sunday 6pm)                         │
│  - Smart Reminder Agent (Cron: hourly)                              │
│  - Schedule Monitor (Event-driven)                                  │
│                                                                     │
│  FEEDBACK & LEARNING SYSTEM                                         │
│  - Post-Task Feedback UI                                            │
│  - Preference Learning Engine                                       │
│  - Pattern Analyzer                                                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Shared Tool Library

All agents will share these tools:

### Calendar Tools
- `readCalendars(userId, startDate, endDate)` - Get all calendar events
- `readExternalCalendars(userId, startDate, endDate)` - ICS feeds

### Task Tools
- `getTasks(userId, filters?)` - Get task definitions
- `getScheduledTasks(familyId, startDate, endDate)` - Get scheduled instances
- `createScheduledTask(taskId, date, startTime, assignedTo, reasoning)`
- `updateScheduledTask(id, updates)`
- `deleteScheduledTask(id)`

### Family Tools
- `getFamilyMembers(userId)` - Get family info
- `getUserPreferences(userId)` - Learned preferences

### Context Tools
- `getWeather(location, date)` - Weather API
- `getTrafficEstimate(origin, destination, time)` - Traffic patterns

### Feedback Tools
- `recordFeedback(scheduledTaskId, feedbackData)`
- `getFeedbackHistory(userId, taskType?)`

### Notification Tools
- `sendNotification(userId, message, type)`
- `scheduleReminder(userId, message, triggerTime)`

---

## Database Schema Additions

```prisma
model UserPreference {
  id         String   @id @default(cuid())
  userId     String
  key        String   // e.g., "preferred_gym_time", "commute_buffer"
  value      Json
  confidence Float    @default(0.5)
  updatedAt  DateTime @updatedAt
  user       User     @relation(fields: [userId], references: [id])
  @@unique([userId, key])
}

model TaskFeedback {
  id              String   @id @default(cuid())
  scheduledTaskId String
  userId          String
  actualDuration  Int?
  timeAccuracy    String?  // "too_short", "just_right", "too_long"
  timeSlotRating  Int?     // 1-5
  wouldReschedule String?  // "earlier", "later", "different_day", "no"
  trafficImpact   Boolean?
  weatherImpact   Boolean?
  energyLevel     String?  // "low", "medium", "high"
  notes           String?
  createdAt       DateTime @default(now())
  scheduledTask   ScheduledTask @relation(...)
  user            User     @relation(...)
}

model AgentMemory {
  id        String   @id @default(cuid())
  familyId  String
  agentType String
  context   Json
  expiresAt DateTime
  createdAt DateTime @default(now())
  family    Family   @relation(...)
}

model Notification {
  id           String    @id @default(cuid())
  userId       String
  type         String    // "reminder", "suggestion", "weekly_plan"
  title        String
  message      String
  actionUrl    String?
  scheduledFor DateTime
  sentAt       DateTime?
  readAt       DateTime?
  createdAt    DateTime  @default(now())
  user         User      @relation(...)
}
```

---

## Implementation Phases

### Phase 1: Foundation (Current) ✅ COMPLETE
- [x] Document plan
- [x] Update Prisma schema with new models (UserPreference, AgentMemory, Notification)
- [x] Enhanced Feedback model with time accuracy, ratings, context impacts
- [x] Create Feedback API endpoints (`/api/feedback`)
- [x] Build post-task feedback UI component (`TaskFeedbackDialog`)
- [x] Integrate feedback UI into dashboard task completion flow
- [x] Implement basic preference learning from feedback

### Phase 2: Tool Library ✅ COMPLETE
- [x] Create `/src/lib/agent-tools/` directory
- [x] Implement calendar tools (getCalendarEvents, findFreeTimeSlots, getCalendarDensity)
- [x] Implement task tools (getUserTasks, getScheduledTasks, createScheduledTask, etc.)
- [x] Implement family tools (getFamilyForUser, analyzeFairness, suggestTaskAssignment)
- [x] Implement preference tools (getPreference, setPreference, getSchedulingContext)
- [x] Implement notification tools (createReminder, createSmartReminder, etc.)
- [x] Implement context tools (getWeather, getTraffic - mock implementations)
- [x] Create Claude tool definitions (AGENT_TOOL_DEFINITIONS)
- [x] Create unified tool executor (executeTool, safeExecuteTool)

### Phase 3: Interactive Agent
- [ ] Set up chat interface UI
- [ ] Implement agent orchestrator with Claude tool use
- [ ] Natural language scheduling capability
- [ ] Conflict mediation capability
- [ ] On-demand optimization capability

### Phase 4: Weekly Planning Worker
- [ ] Set up cron job infrastructure (Vercel Cron or similar)
- [ ] Implement weekly planning logic
- [ ] Draft schedule storage and approval flow
- [ ] Notification integration

### Phase 5: Smart Reminder Worker
- [ ] Implement hourly reminder check job
- [ ] Weather API integration
- [ ] Traffic API integration
- [ ] Context-aware reminder generation
- [ ] Push notification setup

### Phase 6: Pattern Analyzer & Learning
- [ ] Weekly pattern analysis job
- [ ] Preference confidence scoring
- [ ] Feedback aggregation logic
- [ ] Integration with scheduling algorithms

---

## Agent Details

### Interactive Agent
- **Trigger**: User chat input
- **Capabilities**: Natural language scheduling, conflict mediation, optimization
- **Tools**: All tools
- **Response**: Conversational with actions taken

### Weekly Planning Worker
- **Trigger**: Cron - Sunday 6:00 PM
- **Process**:
  1. Fetch all family calendars for next 7 days
  2. Fetch all pending tasks
  3. Fetch user preferences & feedback patterns
  4. Generate optimized schedule
  5. Store as draft pending approval
  6. Send notification

### Smart Reminder Worker
- **Trigger**: Cron - Every hour
- **Process**:
  1. Find tasks in next 2-4 hours
  2. Check weather/traffic/calendar density
  3. Generate context-aware reminder
  4. Queue notification

---

## Feedback Collection

### Quick Feedback UI (post-task completion)
- Time accuracy: Too short / Just right / Too long
- Time slot rating: 1-5 stars
- Optional expansions:
  - Traffic impact checkbox
  - Weather impact checkbox
  - Preferred alternative time
  - Free-form notes

### Learning from Feedback
- Store in TaskFeedback table
- Pattern analyzer runs weekly
- Updates UserPreference with confidence scores
- Future scheduling incorporates learned preferences

---

## Notes & Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-31 | Hybrid agent architecture | Interactive for user-facing, background workers for proactive |
| 2026-01-31 | Single interactive agent | Shared context about family, simpler to maintain |
| 2026-01-31 | Separate background workers | Different triggers, can run in parallel |

---

## Future Considerations

- Voice interface integration
- Mobile push notifications
- Apple Calendar / Outlook direct integration
- Multi-family support (more than 2 members)
- Integration with smart home devices
- Location-based triggers
