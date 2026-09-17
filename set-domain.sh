#!/usr/bin/env bash
# Patches the live domain into the files that need an absolute URL.
# Run once, after the domain in Vercel is final:
#   ./set-domain.sh https://sisi-oven.co.il
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 https://your-domain.co.il" >&2
  exit 1
fi

DOMAIN="${1%/}"
case "$DOMAIN" in
  https://*) ;;
  *) echo "the domain must start with https://" >&2; exit 1 ;;
esac

cd "$(dirname "$0")"
TODAY="$(date +%F)"

python3 - "$DOMAIN" "$TODAY" <<'PY'
import io, re, sys
domain, today = sys.argv[1], sys.argv[2]

def edit(path, fn):
    s = io.open(path, encoding='utf-8').read()
    out = fn(s)
    io.open(path, 'w', encoding='utf-8').write(out)
    print('patched', path)

def index(s):
    s = re.sub(r'<link rel="canonical" href="[^"]*">',
               f'<link rel="canonical" href="{domain}/">', s)
    s = re.sub(r'<meta property="og:url" content="[^"]*">',
               f'<meta property="og:url" content="{domain}/">', s)
    s = re.sub(r'<meta property="og:image" content="[^"]*">',
               f'<meta property="og:image" content="{domain}/assets/social-preview.jpg">', s)
    s = re.sub(r'<meta name="twitter:image" content="[^"]*">',
               f'<meta name="twitter:image" content="{domain}/assets/social-preview.jpg">', s)
    return s.replace('<!-- DEPLOY STEP: set the live domain on canonical, og:url and og:image -->\n', '') \
            .replace('<!-- DEPLOY STEP: patch og:image and og:url with the live absolute URL before deploying -->\n', '')

def robots(s):
    s = re.sub(r'Sitemap: \S+', f'Sitemap: {domain}/sitemap.xml', s)
    return s.replace('# DEPLOY STEP: replace example.com with the live domain\n', '')

def sitemap(s):
    s = re.sub(r'<loc>[^<]*</loc>', f'<loc>{domain}/</loc>', s)
    s = re.sub(r'<lastmod>[^<]*</lastmod>', f'<lastmod>{today}</lastmod>', s)
    return s.replace('<!-- DEPLOY STEP: replace example.com with the live domain -->\n', '')

edit('index.html', index)
edit('robots.txt', robots)
edit('sitemap.xml', sitemap)
PY

echo
echo "done. $DOMAIN is now set on canonical, og:url, og:image, twitter:image, robots.txt and sitemap.xml."
