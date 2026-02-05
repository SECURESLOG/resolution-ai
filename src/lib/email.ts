import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendInviteEmailParams {
  to: string;
  inviterName: string;
  familyName: string;
  inviteCode: string;
}

export async function sendFamilyInviteEmail({
  to,
  inviterName,
  familyName,
  inviteCode,
}: SendInviteEmailParams) {
  const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || "ResolutionAI <onboarding@resend.dev>",
    to,
    subject: `${inviterName} invited you to join "${familyName}" on ResolutionAI`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="display: inline-block; width: 60px; height: 60px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); border-radius: 12px; margin-bottom: 16px;">
              <span style="color: white; font-size: 32px; font-weight: bold; line-height: 60px;">R</span>
            </div>
            <h1 style="color: #1f2937; margin: 0;">ResolutionAI</h1>
          </div>

          <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <h2 style="color: #1f2937; margin-top: 0;">You're Invited!</h2>
            <p style="margin-bottom: 16px;">
              <strong>${inviterName}</strong> has invited you to join their family <strong>"${familyName}"</strong> on ResolutionAI.
            </p>
            <p style="margin-bottom: 24px;">
              ResolutionAI helps families coordinate schedules and achieve their goals together using AI-powered scheduling.
            </p>

            <div style="background: white; border: 2px dashed #e5e7eb; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px;">
              <p style="color: #6b7280; margin: 0 0 8px 0; font-size: 14px;">Your Invite Code</p>
              <p style="font-family: monospace; font-size: 28px; font-weight: bold; color: #3b82f6; margin: 0; letter-spacing: 2px;">${inviteCode}</p>
            </div>

            <div style="text-align: center;">
              <a href="${appUrl}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600;">
                Join ResolutionAI
              </a>
            </div>
          </div>

          <div style="color: #6b7280; font-size: 14px;">
            <p><strong>How to join:</strong></p>
            <ol style="padding-left: 20px;">
              <li>Click the button above or go to <a href="${appUrl}" style="color: #3b82f6;">${appUrl}</a></li>
              <li>Sign in with your Google account</li>
              <li>Go to the Family page</li>
              <li>Click "Join Family" and enter the invite code: <strong>${inviteCode}</strong></li>
            </ol>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            This email was sent by ResolutionAI. If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </body>
      </html>
    `,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
