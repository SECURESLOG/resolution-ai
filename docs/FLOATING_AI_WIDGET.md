# Floating AI Assistant Widget

## Decision Date: February 2025

## Overview

Transform the AI assistant from a standalone page into a floating widget available across all pages of the application.

## Requirements

1. **Floating Widget UI**
   - Small button/icon fixed to bottom-right corner
   - Expands into a chat panel when clicked
   - Available on all authenticated pages

2. **Conversation Memory**
   - Keep last 10 messages in memory
   - Resets on page refresh (no persistence needed)
   - Maintains context across page navigation

3. **Page Context Awareness**
   - Detects which page the user is on
   - Injects relevant page data into AI context
   - Offers contextual suggestions based on current view

4. **Full Feature Parity**
   - All existing AI assistant actions remain available
   - Uses same agent tools (calendar, tasks, preferences, scheduling, context, patterns)

## Architecture

```
┌─────────────────────────────────────────────┐
│  AIAssistantProvider (wraps entire app)     │
│  ├── conversationHistory (last 10 msgs)     │
│  ├── currentPage + pageContext              │
│  ├── availableTools (all existing ones)     │
│  └── sendMessage() / executeAction()        │
└─────────────────────────────────────────────┘
                    │
    ┌───────────────┴───────────────┐
    ▼                               ▼
┌─────────────┐             ┌──────────────┐
│ FloatingChat│             │ Each Page    │
│ Widget (UI) │             │ injects its  │
│             │             │ context data │
└─────────────┘             └──────────────┘
```

## Page Context Injection

| Page | Context Data Provided |
|------|----------------------|
| `/calendar` | Today's tasks, conflicts, free slots |
| `/weekly-plan` | Plan status, pending approvals, plan items |
| `/tasks` | Unscheduled tasks, overdue items |
| `/insights` | Current patterns, suggestions |
| `/dashboard` | Summary stats, upcoming tasks |

## Components to Build

1. **`src/contexts/AIAssistantContext.tsx`**
   - React Context for global AI state
   - Conversation history management
   - Page context registration
   - Message sending logic

2. **`src/components/ai/FloatingAssistant.tsx`**
   - Floating button (minimized state)
   - Expandable chat panel
   - Message input and display
   - Loading states

3. **`src/hooks/usePageContext.ts`**
   - Hook for pages to register their context
   - Provides current page info to AI

4. **`src/app/api/assistant/chat/route.ts`**
   - API endpoint for assistant conversations
   - Handles tool execution
   - Returns streaming or complete responses

## Rationale

### Why a Widget vs Separate Page?

1. **Accessibility**: Users don't need to navigate away from their current task
2. **Context**: AI can see what page user is on and offer relevant help
3. **Engagement**: Lower friction = more AI usage = better user experience
4. **Modern UX**: Follows patterns from Notion AI, Linear, Intercom

### Why In-Memory Only (No Persistence)?

1. **Simplicity**: No database/storage overhead
2. **Privacy**: Conversations don't persist
3. **Freshness**: Each session starts clean
4. **Performance**: No hydration complexity

## Future Extensibility

As the app grows, the widget can support:
- Voice input/output
- Quick action buttons
- Proactive notifications
- Multi-user collaboration hints
- Keyboard shortcuts (Cmd+K style)

## Success Metrics

- Widget open rate per session
- Messages sent per user
- Action completion rate via AI
- User retention correlation
