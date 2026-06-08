#!/bin/sh
# build.sh — يُشغَّل في Cloudflare Pages قبل النشر
# يستبدل placeholders في config.js بالقيم الحقيقية من Environment Variables

set -e

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "WARNING: SUPABASE_URL or SUPABASE_ANON_KEY not set — skipping injection. Change variable type to Text in Cloudflare Pages to enable."
  exit 0
fi

sed -i "s|__SUPABASE_URL__|$SUPABASE_URL|g"       config.js
sed -i "s|__SUPABASE_ANON_KEY__|$SUPABASE_ANON_KEY|g" config.js

echo "✓ config.js injected with Supabase credentials."
