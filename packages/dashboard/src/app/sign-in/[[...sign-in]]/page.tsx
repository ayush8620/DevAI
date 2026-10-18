import type { Metadata } from 'next';
import { SignIn } from '@clerk/nextjs';
import { pageMetadata } from '@/lib/seo';
import { AuthShell, ClerkNotConfigured } from '@/components/auth/auth-shell';
import { clerkEnabled, SIGN_UP_URL } from '@/lib/clerk';

export const metadata: Metadata = pageMetadata({ title: 'Sign in', description: 'Sign in to DevAI to manage your provider keys, dvai_ API keys, projects, usage and hackathon kits.', path: '/sign-in', noindex: true });

export default function SignInPage() {
  return (
    <AuthShell>
      {clerkEnabled
        ? <SignIn signUpUrl={SIGN_UP_URL} fallbackRedirectUrl="/dashboard" />
        : <ClerkNotConfigured />}
    </AuthShell>
  );
}
