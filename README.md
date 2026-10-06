# KL Vibe Tribe

**Your campus. Your people. Your vibe.**

A private, Instagram-inspired campus community for KL students.

## Stack
- Next.js App Router
- Supabase Auth + PostgreSQL + Realtime-ready data model
- Vercel

## Features
- Private sign-in / invite-based joining
- Community guidelines consent
- Feed, stories, likes, saves and posts
- Member directory and profiles
- Private 1-to-1 messaging
- Notifications-ready schema
- Vibe AI interface with a strict privacy boundary
- Responsive premium UI

## Local setup
1. `npm install`
2. Copy `.env.example` to `.env.local`
3. Add a dedicated Supabase project URL and publishable key
4. Apply `supabase/migrations/001_kl_vibe_tribe.sql`
5. `npm run dev`

Never put a Supabase service-role key in the browser. Use the publishable key with RLS.
