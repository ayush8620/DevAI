import { NextResponse } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// /dashboard and /admin require a Clerk session (/admin additionally checks the gateway admin
// allowlist server-side in app/admin/layout.tsx and every admin page, and 404s non-admins). The landing page, the API docs (/docs), /pricing,
// /sign-in, /sign-up and the Razorpay webhook stay public. (/api/billing/subscribe, /verify, /cancel and /coupon
// check the session themselves and answer 401 instead of redirecting.)
const isProtected = createRouteMatcher(['/dashboard(.*)', '/admin(.*)']);
const isPublic = createRouteMatcher(['/', '/docs(.*)', '/pricing(.*)', '/kit(.*)', '/sign-in(.*)', '/sign-up(.*)', '/api/billing/webhook(.*)']);

// Without Clerk keys (local dev, self-hosting) the dashboard is open and the gateway
// admin key from Settings protects the data, exactly as before.
const enabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

export default enabled
  ? clerkMiddleware(
      async (auth, req) => {
        if (isProtected(req) && !isPublic(req)) await auth.protect();
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
