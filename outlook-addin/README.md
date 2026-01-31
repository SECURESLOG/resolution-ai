# ResolutionAI Outlook Add-in

This add-in allows you to sync your AI-scheduled tasks from ResolutionAI directly to your corporate Microsoft 365 calendar.

## Why an Add-in?

Corporate M365 environments typically block third-party apps from accessing calendars via API. This add-in runs within Outlook itself, using your existing permissions to create calendar events - no IT admin approval needed.

## Installation (Sideloading)

### For Development/Testing

1. **Start the ResolutionAI server**
   ```bash
   cd resolution-ai
   npm run dev
   ```

2. **Open Outlook on the web** (outlook.office.com)

3. **Go to Settings** → **View all Outlook settings** → **Mail** → **Customize actions** → **Get add-ins**

4. **Click "My add-ins"** in the left sidebar

5. **Click "Add a custom add-in"** → **Add from file**

6. **Upload the `manifest.xml` file** from this folder

7. **The add-in will appear in your Outlook ribbon**

### For Production

1. Update the URLs in `manifest.xml` to your production domain
2. Submit to Microsoft AppSource or deploy via Microsoft 365 admin center

## How to Use

1. Open Outlook and click the **"Sync Tasks"** button in the ribbon

2. **First time only:** Paste your connection token from ResolutionAI Settings

3. Click **"Sync"** on individual tasks or **"Sync All"** to create calendar events

4. The add-in will create events directly in your M365 calendar

## Getting Your Token

1. Go to [ResolutionAI Settings](http://localhost:3000/settings)
2. Scroll to **"Outlook Add-in"** section
3. Click **"Generate Token"**
4. Copy the token and paste it in the add-in

## Architecture

```
┌─────────────────────┐
│   ResolutionAI      │
│   (Web App)         │
│   - Generates AI    │
│     schedule        │
│   - Stores tasks    │
└──────────┬──────────┘
           │ API
           ▼
┌─────────────────────┐
│  Outlook Add-in     │
│  (This component)   │
│  - Fetches tasks    │
│  - Creates events   │
│    via Office.js    │
└──────────┬──────────┘
           │ Office.js API
           ▼
┌─────────────────────┐
│  M365 Calendar      │
│  (User's work       │
│   calendar)         │
└─────────────────────┘
```

## Upgrading to Background Sync (Option B)

The current implementation uses manual sync (Option A). To upgrade to automatic background sync:

1. Add a timer-based trigger in the add-in
2. Use `Office.context.mailbox.addHandlerAsync` for background events
3. Consider using Azure Functions for server-side sync

## Files

- `manifest.xml` - Add-in configuration and metadata
- `src/app/addin/page.tsx` - Add-in UI (served by Next.js)
- `src/app/api/addin/` - API endpoints for the add-in

## Troubleshooting

**"Token expired" error**
- Generate a new token from ResolutionAI Settings

**Add-in not appearing**
- Make sure the Next.js server is running on `localhost:3000`
- Check browser console for errors

**Events not being created**
- The add-in opens a new appointment form - you need to save it manually
- Future versions will use the Calendar REST API for direct creation
