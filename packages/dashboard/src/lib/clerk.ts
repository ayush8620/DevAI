/**
 * Clerk sign-in is optional: it turns on when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set
 * (inlined at build time). Without it the dashboard works as before, using the admin key
 * saved on the Settings page, so local builds and dev need no Clerk account.
 */
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export const SIGN_IN_URL = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in';
export const SIGN_UP_URL = process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL || '/sign-up';

/**
 * Clerk components themed with the dashboard's own CSS variables, so they follow
 * light/dark mode. The sign-in methods (email, Google, GitHub, ...) are whatever is
 * enabled in the Clerk dashboard; nothing here restricts them.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: 'hsl(var(--primary))',
    colorPrimaryForeground: 'hsl(var(--primary-foreground))',
    colorBackground: 'hsl(var(--card))',
    colorForeground: 'hsl(var(--card-foreground))',
    colorMuted: 'hsl(var(--muted))',
    colorMutedForeground: 'hsl(var(--muted-foreground))',
    colorInput: 'hsl(var(--background))',
    colorInputForeground: 'hsl(var(--foreground))',
    // Clerk derives borders and shadows from colorNeutral at low alpha. Using the
    // foreground colour keeps them visible in dark mode as well as light mode.
    colorNeutral: 'hsl(var(--foreground))',
    // Clerk defines its own --border variable on its elements, so use --input (same
    // value as --border in both themes) for anything rendered inside Clerk components.
    colorBorder: 'hsl(var(--input))',
    colorRing: 'hsl(var(--ring))',
    colorDanger: 'hsl(var(--destructive))',
    borderRadius: '0.5rem',
    fontFamily: 'inherit',
  },
  elements: {
    cardBox: '!border !border-input !shadow-xl !shadow-black/10',
    card: '!bg-card',
    footer: '!bg-none !bg-card !border-t !border-input',
    socialButtonsBlockButton: '!border !border-input !bg-background hover:!bg-muted !text-foreground !shadow-none',
    socialButtonsBlockButtonText: '!font-medium',
    formFieldInput: '!border !border-input !bg-background !shadow-none focus:!ring-2 focus:!ring-ring',
    dividerLine: '!bg-input',
    formButtonPrimary: '!bg-primary hover:!bg-primary-hover !text-primary-foreground !shadow',
  },
  options: {
    // Full-width "Continue with Google" / "Continue with GitHub" buttons above the email form.
    socialButtonsVariant: 'blockButton' as const,
    socialButtonsPlacement: 'top' as const,
    logoPlacement: 'none' as const,
  },
};
