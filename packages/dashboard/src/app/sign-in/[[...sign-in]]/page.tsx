import type { Metadata } from 'next';
import { SignIn } from '@clerk/nextjs';
import { AuthShell, ClerkNotConfigured } from '@/components/auth/auth-shell';
import { clerkEnabled, SIGN_UP_URL } from '@/lib/clerk';

export const metadata: Metadata = { title: 'Sign in · DevAI' };

export default function SignInPage() {
  return (
    <AuthShell>
      {clerkEnabled
        ? <SignIn signUpUrl={SIGN_UP_URL} fallbackRedirectUrl="/dashboard" />
        : <ClerkNotConfigured />}
    </AuthShell>
  );
}
