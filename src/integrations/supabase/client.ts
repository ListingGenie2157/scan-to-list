import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Use environment variables for local development, fallback to production values
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://yfynlpwzrxoxcwntigjv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmeW5scHd6cnhveGN3bnRpZ2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNTY3OTIsImV4cCI6MjA2OTkzMjc5Mn0.bUw5LbFzK4pQc7I83S_lthA0IyqruEPS-_gfOwy3zV4";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});