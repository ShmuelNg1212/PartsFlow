// Production builds require explicit host values. Never read development .env.local here.
const url = process.env.VITE_SUPABASE_URL?.trim()
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
const errors = []
if (!url) errors.push('Set VITE_SUPABASE_URL for the production build.')
else {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error()
  } catch {
    errors.push('VITE_SUPABASE_URL must be an HTTPS origin without a path or credentials.')
  }
}
if (!key) errors.push('Set VITE_SUPABASE_PUBLISHABLE_KEY for the production build.')
else if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
  errors.push('VITE_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key. Never use a server secret.')
}
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
}
