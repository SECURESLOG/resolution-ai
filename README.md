# ResolutionAI

AI-powered family scheduling app for the Encode Club Comet Resolution V2 Hackathon.

**ResolutionAI** helps you achieve your New Year resolutions by intelligently scheduling tasks around your existing calendar commitments. Our AI analyzes your schedule and recommends optimal times for your personal goals and household responsibilities.

## Features

- **Google Calendar Integration**: Connect your calendar and let AI find available time slots
- **AI-Powered Scheduling**: Claude AI analyzes your calendar and suggests optimal times for tasks
- **Task Management**: Create and manage resolution goals and household chores
- **Smart Recommendations**: Get personalized scheduling with explanations for each recommendation
- **Calendar Blocking**: Approve AI suggestions and automatically create Google Calendar events
- **Progress Tracking**: Track your completion rates and maintain streaks

## Tech Stack

- **Frontend/Backend**: Next.js 14 with TypeScript (App Router)
- **Database**: PostgreSQL on Supabase
- **ORM**: Prisma
- **Authentication**: NextAuth.js with Google OAuth
- **AI**: Anthropic Claude API
- **Calendar**: Google Calendar API
- **Styling**: TailwindCSS + shadcn/ui
- **Deployment**: Vercel

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- PostgreSQL database (Supabase recommended)
- Google Cloud Console project
- Anthropic API key

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd resolution-ai
npm install
```

### 2. Set Up Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Then fill in your values:

#### Database URL (Supabase)

1. Go to [Supabase](https://supabase.com) and create a new project
2. Go to Settings > Database
3. Copy the connection string (URI format)
4. Replace `[YOUR-PASSWORD]` with your database password

#### NextAuth Secret

Generate a secret:

```bash
openssl rand -base64 32
```

#### Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Go to APIs & Services > Credentials
4. Click "Create Credentials" > "OAuth 2.0 Client IDs"
5. Choose "Web application"
6. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (development)
   - `https://your-domain.vercel.app/api/auth/callback/google` (production)
7. Copy the Client ID and Client Secret

#### Enable Google Calendar API

1. In Google Cloud Console, go to APIs & Services > Library
2. Search for "Google Calendar API"
3. Enable it

#### Anthropic API Key

1. Go to [Anthropic Console](https://console.anthropic.com)
2. Create an API key
3. Copy the key (starts with `sk-ant-`)

### 3. Set Up Database

Generate Prisma client and run migrations:

```bash
npx prisma generate
npx prisma db push
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deployment to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo>
git push -u origin main
```

### 2. Deploy to Vercel

1. Go to [Vercel](https://vercel.com)
2. Import your GitHub repository
3. Add environment variables in the Vercel dashboard:
   - `DATABASE_URL`
   - `NEXTAUTH_URL` (your Vercel domain, e.g., `https://resolution-ai.vercel.app`)
   - `NEXTAUTH_SECRET`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `ANTHROPIC_API_KEY`
4. Deploy

### 3. Update Google OAuth

Add your Vercel URL to Google Cloud Console authorized redirect URIs:
- `https://your-app.vercel.app/api/auth/callback/google`

## Project Structure

```
resolution-ai/
├── prisma/
│   └── schema.prisma      # Database schema
├── src/
│   ├── app/
│   │   ├── (authenticated)/  # Protected routes
│   │   │   ├── dashboard/
│   │   │   ├── tasks/
│   │   │   ├── calendar/
│   │   │   └── settings/
│   │   ├── api/              # API routes
│   │   │   ├── auth/
│   │   │   ├── tasks/
│   │   │   ├── calendar/
│   │   │   ├── schedule/
│   │   │   └── scheduled-tasks/
│   │   └── page.tsx          # Landing page
│   ├── components/
│   │   ├── ui/               # shadcn/ui components
│   │   ├── layout/
│   │   └── providers/
│   ├── lib/
│   │   ├── auth.ts           # NextAuth config
│   │   ├── prisma.ts         # Prisma client
│   │   ├── calendar.ts       # Google Calendar helpers
│   │   └── ai-scheduler.ts   # AI scheduling logic
│   └── types/
│       └── index.ts          # TypeScript types
└── README.md
```

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/tasks` | List all tasks |
| POST | `/api/tasks` | Create a task |
| PATCH | `/api/tasks/[id]` | Update a task |
| DELETE | `/api/tasks/[id]` | Delete a task |
| GET | `/api/calendar` | Get calendar events |
| POST | `/api/schedule/generate` | Generate AI schedule |
| POST | `/api/schedule/approve` | Approve and create events |
| GET | `/api/scheduled-tasks` | Get scheduled tasks |
| PATCH | `/api/scheduled-tasks/[id]` | Update task status |
| GET | `/api/stats` | Get user statistics |

## Demo Walkthrough

1. **Sign in** with your Google account
2. **Add tasks** - Create resolution goals (gym, reading, learning) and household tasks
3. **Generate schedule** - Click "Generate This Week's Schedule" on the dashboard
4. **Review recommendations** - See AI-suggested time slots with explanations
5. **Approve schedule** - Tasks are added to your Google Calendar
6. **Track progress** - Mark tasks complete and build streaks

## Coming Soon (Phase 2)

- Family Management (2-person scheduling)
- Fair task distribution between family members
- Feedback system for learning preferences
- Weekly progress reports
- Advanced analytics and charts

## License

MIT

---

Built with love for the Encode Club Comet Resolution V2 Hackathon 2026
