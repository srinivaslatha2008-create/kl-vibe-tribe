import { createClient } from '@supabase/supabase-js'

// Supabase publishable key is safe for browser use. Never put the service-role key here.
const url = 'https://xymeuuqxxnzvzqgqwakj.supabase.co'
const key = 'sb_publishable_K6naqMzxqstYOmsu_6yNpg_UeSalUsz'

export const supabase = createClient(url, key)
