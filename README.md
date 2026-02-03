# ResolutionAI

**AI-powered scheduling that turns New Year's resolutions into lasting habits.**

---

## The Problem

**92% of New Year's resolutions fail.** Why?

- **Scheduling conflicts** — "I'll go to the gym... but I have meetings all day"
- **Family obligations** — "I wanted to read, but the kids needed me"
- **Life gets in the way** — "I was too tired after work"

The real issue isn't motivation — it's **planning**. Most people set goals without accounting for their actual life: work calendars, family schedules, energy levels, and daily chaos.

---

## The Solution

**ResolutionAI** is an AI assistant that plans around YOUR life — not the other way around.

```
Your Goals + Your Calendar + Your Family = A Plan That Actually Works
```

### How It Works

| Step | What Happens |
|------|--------------|
| 1. **Connect** | Link your Google/Outlook calendar and add family members |
| 2. **Define** | Set your resolutions and household responsibilities |
| 3. **Generate** | AI analyzes everyone's schedules and creates an optimal weekly plan |
| 4. **Live** | Tasks appear at the right time, fairly distributed |
| 5. **Learn** | AI gets smarter with every feedback you provide |

---

## The Magic: AI That Learns

This isn't a static scheduler. **ResolutionAI learns from you.**

```
Week 1: AI suggests gym at 6 AM
        You skip it → "Too early"

Week 2: AI suggests gym at 7 PM
        You complete it → "Perfect!"

Week 3+: AI remembers you're an evening exerciser
         Accuracy improves. Habits form.
```

### What the AI Learns:

- **Time preferences** — Morning person? Night owl?
- **Energy patterns** — When you're most productive
- **Family dynamics** — Who's busier on which days
- **Task patterns** — How long things actually take you

---

## The Proof: Measured with Opik

We don't just claim the AI improves — **we prove it.**

Using [Comet Opik](https://www.comet.com/site/products/opik/) for LLM observability, we track every aspect of AI performance:

### AI Learning Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                    RESOLUTIONAI LEARNING LOOP                   │
└─────────────────────────────────────────────────────────────────┘

     ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
     │   INPUTS    │         │  AI ENGINE  │         │   OUTPUT    │
     │─────────────│         │─────────────│         │─────────────│
     │ • Goals     │────────▶│  Claude AI  │────────▶│ Weekly Plan │
     │ • Calendar  │         │      +      │         │ Scheduled   │
     │ • Family    │         │  Learning   │         │ Tasks       │
     │ • Prefs     │         │  Context    │         │             │
     └─────────────┘         └──────┬──────┘         └──────┬──────┘
                                    │                       │
                             ┌──────▼──────┐                │
                             │    OPIK     │                │
                             │ OBSERVABILITY│                │
                             │─────────────│                │
                             │ • Traces    │                │
                             │ • Metrics   │                │
                             │ • Evals     │                │
                             └──────┬──────┘                │
                                    │                       │
                                    │    ┌──────────────────▼───┐
                                    │    │     USER ACTIONS     │
                                    │    │──────────────────────│
                                    │    │  ✓ Complete task     │
                                    │    │  ✗ Skip task         │
                                    │    │  📝 Give feedback    │
                                    │    └──────────┬───────────┘
                                    │               │
                             ┌──────▼───────────────▼──────┐
                             │     LEARNING FEEDBACK       │
                             │────────────────────────────│
                             │ • Update preferences        │
                             │ • Calculate accuracy        │
                             │ • Improve next schedule     │
                             └──────────────┬──────────────┘
                                            │
                             ┌──────────────▼──────────────┐
                             │   OPIK LEARNING DASHBOARD   │
                             │────────────────────────────│
                             │ 📈 Accuracy: 62% → 84%     │
                             │ 📊 Completion: +18%        │
                             │ 🎯 Preferences: 14 learned │
                             └─────────────────────────────┘
```

### What We Track in Opik:

| Metric | What It Measures |
|--------|------------------|
| **Scheduling Accuracy** | Did the user complete tasks at scheduled times? |
| **Completion Rate** | Overall task completion trending over weeks |
| **Preference Confidence** | How certain AI is about learned patterns |
| **Family Fairness** | Even distribution of household tasks |
| **Burnout Risk** | Preventing over-scheduling |

---

## Key Features

### Smart Scheduling
- AI finds optimal time slots around your real commitments
- Respects fixed constraints (school pickup at 4:30 PM, gym MWF only)
- Balances resolution goals with household duties

### Family Coordination
- 2-person family scheduling
- Fair task distribution algorithm
- Shared calendar visibility (see partner's work calendar)
- Family approval workflow for weekly plans

### Calendar Integration
- Google Calendar
- Microsoft Outlook / Azure AD
- External ICS calendars (work calendars)
- Color-coded event types

### AI That Improves
- Learns from every completed/skipped task
- Adapts to your energy patterns
- Remembers time preferences
- Gets smarter every week

### Progress & Motivation
- Streak tracking
- Weekly progress visualization
- Daily AI insights
- Completion celebrations

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14, React, TailwindCSS, shadcn/ui |
| **Backend** | Next.js API Routes, Prisma ORM |
| **Database** | PostgreSQL (Supabase) |
| **AI** | Anthropic Claude API |
| **Observability** | Comet Opik |
| **Auth** | NextAuth.js (Google, Microsoft) |
| **Calendars** | Google Calendar API, Microsoft Graph API |
| **Deployment** | Vercel |

---

## Why ResolutionAI?

| Traditional Apps | ResolutionAI |
|------------------|--------------|
| Static todo lists | Dynamic AI scheduling |
| Manual planning | Automatic optimization |
| Individual only | Family coordination |
| No learning | Improves over time |
| Hope-based | Data-driven (Opik) |

---

## Categories

- **Productivity & Work Habits** — Helping people build lasting habits around their real life
- **Best Use of Opik** — Full observability into AI learning and improvement

---

*"The best resolution app isn't one that reminds you to do things. It's one that finds when you actually can."*
