import type { Metadata } from 'next';
import { SignUp } from '@clerk/nextjs';
import { pageMetadata } from '@/lib/seo';
import { AuthShell, ClerkNotConfigured } from '@/components/auth/auth-shell';
import { clerkEnabled, SIGN_IN_URL } from '@/lib/clerk';

export const metadata: Metadata = pageMetadata({ title: 'Create your account', description: 'Create a free DevAI account: one OpenAI-compatible endpoint that runs on your own OpenAI, Gemini, Groq or OpenRouter keys.', path: '/sign-up', noindex: true });

export default function SignUpPage() {
  return (
    <AuthShell>
      {clerkEnabled
        ? <SignUp signInUrl={SIGN_IN_URL} fallbackRedirectUrl="/dashboard" />
        : <ClerkNotConfigured />}
    </AuthShell>
  );
}
