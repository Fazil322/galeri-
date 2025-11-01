
import { createClient } from '@supabase/supabase-js';

// IMPORTANT: These should be stored in environment variables in a real project.
const supabaseUrl = 'https://ccohomxjwngjeqtfrvas.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjb2hvbXhqd25namVxdGZydmFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4MDk0NDQsImV4cCI6MjA3NzM4NTQ0NH0.fS-rAGs9M66_XoQ830vVGkm5KigZx0KA9TQVk7irtQU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
