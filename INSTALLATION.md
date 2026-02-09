# Installation & Testing Guide

This guide will help you set up ResolutionAI locally for development and testing.

---

## Prerequisites

Before you begin, ensure you have the following installed:

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | 18.x or higher | `node --version` |
| npm | 9.x or higher | `npm --version` |
| Git | Any recent version | `git --version` |

You'll also need:
- A [Google Cloud Console](https://console.cloud.google.com) account (for OAuth)
- A [Supabase](https://supabase.com) account (for PostgreSQL database)
- An [Anthropic](https://console.anthropic.com) API key (for AI features)
- A [Comet Opik](https://www.comet.com/site/products/opik/) account (for AI observability)

---

## Step 1: Clone the Repository

```bash
git clone https://github.com/your-username/resolution-ai.git
cd resolution-ai
```

---

## Step 2: Install Dependencies

```bash
npm install
```

---

## Step 3: Set Up Environment Variables

Create a `.env.local` file in the root directory:

```bash
cp .env.example .env.local
```

Then fill in the following variables:

```env
# Database (Supabase)
DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"  # Generate with: openssl rand -base64 32

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Anthropic AI
ANTHROPIC_API_KEY="your-anthropic-api-key"

# Comet Opik (optional, for AI observability)
OPIK_API_KEY="your-opik-api-key"
OPIK_WORKSPACE="your-workspace"
OPIK_PROJECT_NAME="ResolutionAI"
```

### Getting API Keys

#### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Navigate to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth client ID**
5. Choose **Web application**
6. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
7. Copy the Client ID and Client Secret

#### Supabase Database
1. Go to [Supabase](https://supabase.com) and create a new project
2. Navigate to **Settings → Database**
3. Copy the connection strings (use Transaction pooler for `DATABASE_URL`)

#### Anthropic API
1. Go to [Anthropic Console](https://console.anthropic.com)
2. Create an API key
3. Copy the key

---

## Step 4: Set Up the Database

Generate the Prisma client and push the schema to your database:

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push
```

---

## Step 5: Run the Development Server

```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000)

---

## Testing with Demo Data

We provide a demo seed endpoint to quickly populate the app with realistic test data. This is useful for:
- Testing the full user experience
- Demonstrating features
- Development and debugging

### Using the Demo Seed API

#### Reset and Seed Demo Data

```bash
curl -X POST http://localhost:3000/api/demo/seed
```

This will:
1. **Clear existing data** for demo users (Bharath & Sanjana)
2. **Create work schedules** with office/WFH days and commute times
3. **Create 13 tasks** (focus goals + life admin)
4. **Create "messy" scheduled tasks** in suboptimal time slots
5. **Create 2 weeks of historical data** for dashboard stats
6. **Create AI preferences** showing learned patterns
7. **Create feedback entries** for the intelligence loop

#### Check Current State

```bash
curl http://localhost:3000/api/demo/seed
```

Returns the current state of demo users and their data.

### What the Demo Data Includes

| Category | Details |
|----------|---------|
| **Users** | Bharath (primary demo user) & Sanjana (family member) |
| **Family** | "Kashyaps" family with shared tasks |
| **Focus Tasks** | Morning Run, Meditation, Reading, Yoga, Learn Spanish |
| **Life Admin** | Grocery Shopping, Meal Prep, Laundry, School Pickup, etc. |
| **Work Schedules** | Office/WFH patterns with commute times |
| **Historical Data** | 2 weeks of completed tasks (~85% completion rate) |
| **AI Preferences** | 5 learned preferences with confidence scores |
| **Streak** | ~6-7 days of consecutive completions |

### Demo Flow

After seeding, you can demonstrate:

1. **Dashboard** (`/`) - See stats, streak, AI insights
2. **Schedule** (`/schedule`) - See "messy" calendar with bad time slots
3. **Optimize My Week** - Click to see AI transform the schedule
4. **Drag & Drop** - Move tasks to show user control
5. **Complete Task** - Show "Should AI learn?" dialog
6. **Family View** - Show fair task distribution

### Resetting for Multiple Demo Runs

Simply call the seed endpoint again:

```bash
curl -X POST http://localhost:3000/api/demo/seed
```

Each call completely resets and re-seeds the demo data.

---

## Production Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import the repository in [Vercel](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy

### Environment Variables for Production

In production, also add:

```env
DEMO_SEED_SECRET="your-secret-key"  # Protects the seed endpoint
```

To use the seed endpoint in production:

```bash
curl -X POST https://your-app.vercel.app/api/demo/seed \
  -H "x-demo-seed-key: your-secret-key"
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `Module not found: @prisma/client` | Run `npx prisma generate` |
| Database connection error | Check `DATABASE_URL` in `.env.local` |
| Google OAuth error | Verify redirect URI matches exactly |
| Port 3000 in use | Kill other processes or use `npm run dev -- -p 3001` |

### Clearing Build Cache

If you encounter strange build errors:

```bash
rm -rf .next node_modules
npm install
npm run dev
```

---

## Need Help?

- Check the [README](./README.md) for feature overview
- Open an issue on GitHub for bugs
- See [Comet Opik docs](https://www.comet.com/docs/opik/) for observability setup

---

*Built with Next.js, Prisma, and Claude AI*
