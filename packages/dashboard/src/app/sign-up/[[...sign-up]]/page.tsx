import type { Metadata } from 'next';
import { SignUp } from '@clerk/nextjs';
import { AuthShell, ClerkNotConfigured } from '@/components/auth/auth-shell';
import { clerkEnabled, SIGN_IN_URL } from '@/lib/clerk';

export const metadata: Metadata = { title: 'Create account · DevAI' };

export default function SignUpPage() {
  return (
    <AuthShell>
      {clerkEnabled
        ? <SignUp signInUrl={SIGN_IN_URL} fallbackRedirectUrl="/dashboard" />
        : <ClerkNotConfigured />}
    </AuthShell>
  );
}
