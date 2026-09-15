# Command: /phase1-init

## Purpose
Initialise the NYX Suite project from zero. Run this ONCE at the
start of the project. Do not run again — it will overwrite things.

## Pre-requisites (do these manually first)
- [ ] Node.js 20+ installed
- [ ] Git installed and configured
- [ ] Supabase account created at supabase.com
- [ ] Vercel account created at vercel.com
- [ ] Anthropic API key from console.anthropic.com
- [ ] Stripe account created at stripe.com
- [ ] Domain purchased (nyx.fund or trynyx.com)

## Step 1: Create Next.js project
```bash
npx create-next-app@latest nyx-fund \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd nyx-fund
```

## Step 2: Install core dependencies
```bash
# UI components
npx shadcn@latest init
npx shadcn@latest add card button input label badge
npx shadcn@latest add table tabs dialog sheet
npx shadcn@latest add dropdown-menu avatar separator

# Data and charting
npm install recharts
npm install ccxt
npm install ethers

# Supabase
npm install @supabase/supabase-js @supabase/ssr

# AI
npm install @anthropic-ai/sdk

# Payments
npm install stripe @stripe/stripe-js

# Utilities
npm install date-fns
npm install decimal.js
npm install zod
npm install @tanstack/react-query

# Email
npm install resend

# Dev tools
npm install -D vitest @vitejs/plugin-react
npm install -D @playwright/test
npm install -D @testing-library/react @testing-library/jest-dom
```

## Step 3: Set up environment variables
Create `.env.local`:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Anthropic
ANTHROPIC_API_KEY=your_anthropic_key

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable
STRIPE_WEBHOOK_SECRET=your_webhook_secret

# Encryption (for API keys at rest)
ENCRYPTION_KEY=generate_32_char_random_string

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Step 4: Set up Supabase
```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref your_project_ref

# Create the schema (paste the SQL from data agent)
supabase db push
```

## Step 5: Create folder structure
```bash
mkdir -p src/features/auth/components
mkdir -p src/features/portfolio/components
mkdir -p src/features/portfolio/hooks
mkdir -p src/features/portfolio/utils
mkdir -p src/features/reports/components
mkdir -p src/features/chat/components
mkdir -p src/features/alerts/components
mkdir -p src/features/settings/components
mkdir -p src/lib/supabase/queries
mkdir -p src/lib/ai/prompts
mkdir -p src/lib/exchanges
mkdir -p src/lib/crypto
mkdir -p src/lib/types
mkdir -p src/components/ui
mkdir -p .claude/agents
mkdir -p .claude/commands
mkdir -p memory/obsidian/vault/decisions
mkdir -p memory/obsidian/vault/builds
mkdir -p memory/obsidian/vault/customers
mkdir -p memory/rag
```

## Step 6: Copy agent files
Copy all .claude/agents/*.md files from the setup repo into your project.

## Step 7: Verify setup
```bash
npm run dev
# Should start on localhost:3000 with no errors
```

## Step 8: Update CLAUDE.md status
Change current status to:
```
Phase:    1 — Foundation
Progress: 15% (project initialised)
Next task: Build Supabase auth flow
```

## You're ready. Say:
> "Architect: project initialised. What's the next task in Phase 1?"
