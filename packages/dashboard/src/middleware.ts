import { NextResponse } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// /dashboard requires a Clerk session. The landing page, /sign-in and /sign-up stay public.
const isProtected = createRouteMatcher(['/dashboard(.*)']);

// Without Clerk keys (local dev, self-hosting) the dashboard is open and the gateway
// admin key from Settings protects the data, exactly as before.
const enabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

export default enabled
  ? clerkMiddleware(
      async (auth, req) => {
        if (isProtected(req)) await auth.protect();
      },
      {
        signInUrl: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in',
        signUpUrl: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL || '/sign-up',
      },
    )
  : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip Next.js internals and static files.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
