#!/usr/bin/env python3
"""Regenerates the structured data block in index.html from the page itself.

The point is that the markup can never claim something the page does not say:
every dish, price and FAQ answer below is read out of index.html, not typed
here. Run it after editing the menu or the FAQ:

    python3 tools/build-schema.py

It rewrites the <script type="application/ld+json"> block in place and leaves
everything else alone.

Deliberately NOT emitted here: AggregateRating and Review. The two reviews on
the page are quoted from Google - the page says so itself - and Google's
structured data policy forbids marking up reviews collected from a third-party
site as your own. A page using Restaurant/LocalBusiness is also ineligible for
review stars when the business is rating itself. Adding them risks a manual
action on the site and buys nothing, because Google already shows the real
rating in the business profile. If the owner ever collects first-party
testimonials with the writers' permission, that becomes legitimate - until
then it stays out.
"""
import io
import json
import re
import sys

PATH = 'index.html'
html = io.open(PATH, encoding='utf-8').read()

# The site URL is whatever set-domain.sh already stamped onto the canonical, so
# the two can never disagree.
m = re.search(r'<link rel="canonical" href="([^"]*)">', html)
site = (m.group(1) if m else '').rstrip('/')
if not site or '__SITE_URL__' in site:
    sys.exit('canonical is not set yet - run ./set-domain.sh https://your-domain first')

# ---------------------------------------------------------------- the menu
rows = re.findall(r'<li class="dish-row[^"]*"[^>]*data-cat="([^"]*)"[^>]*>(.*?)</li>', html, re.S)
if not rows:
    sys.exit('no dish rows found - the menu markup must have changed shape')

by_cat = {}
priced = 0
for cat, body in rows:
    name = re.search(r'<span class="dish-title">([^<]*)</span>', body)
    if not name:
        continue
    item = {'@type': 'MenuItem', 'name': name.group(1).strip()}
    note = re.search(r'<p class="dish-note">([^<]*)</p>', body)
    if note:
        item['description'] = note.group(1).strip()
    price = re.search(r'<span class="dish-price">([^<]*)</span>', body)
    if price:
        p = re.match(r'^(\d+(?:\.\d+)?)\s*₪$', price.group(1).strip())
        if p:
            # dishes priced "בטלפון" get no offer rather than a made-up number
            item['offers'] = {'@type': 'Offer', 'price': p.group(1), 'priceCurrency': 'ILS'}
            priced += 1
    by_cat.setdefault(cat, []).append(item)

menu_sections = [{'@type': 'MenuSection', 'name': c, 'hasMenuItem': items}
                 for c, items in by_cat.items()]

# ------------------------------------------------------------------ the FAQ
# Google retired FAQ rich results in 2023 for everyone but government and health
# sites, so this is not worth promising anyone stars. Bing and the AI answer
# engines still read it, and it costs nothing to keep correct.
faq = []
faq_section = re.search(r'<section id="faq".*?</section>', html, re.S)
if faq_section:
    for q, a in re.findall(r'<summary>(.*?)</summary>\s*<p>(.*?)</p>',
                           faq_section.group(0), re.S):
        strip = lambda s: re.sub(r'<[^>]+>', '', s).strip()
        faq.append({'@type': 'Question', 'name': strip(q),
                    'acceptedAnswer': {'@type': 'Answer', 'text': strip(a)}})

# --------------------------------------------------------- the business node
# No geo coordinates and no sameAs: nobody has verified the latitude/longitude
# or the social profiles, and a plausible guess published as structured data is
# still a wrong fact about a real business. hasMap is derived from the address
# already on the page, so it is safe.
maps = re.search(r'href="(https://www\.google\.com/maps/search/[^"]*)"', html)

restaurant = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': site + '/#restaurant',
    'name': 'התנור של סבתא סיסי',
    'url': site + '/',
    'image': site + '/assets/social-preview.jpg',
    'description': 'מסעדה צמחונית כשרה בחולון. קציצות עירוק, סביח הבית, קוסקוס עננים ומרקים ביתיים.',
    'telephone': '+972-52-629-9357',
    'address': {
        '@type': 'PostalAddress',
        'streetAddress': 'אילת 36',
        'addressLocality': 'חולון',
        'addressCountry': 'IL'
    },
    'servesCuisine': ['מטבח ביתי', 'צמחוני', 'ישראלי'],
    'priceRange': '₪₪',
    # there is no booking system anywhere on the site, so saying so is accurate
    'acceptsReservations': False,
    'openingHoursSpecification': [
        {'@type': 'OpeningHoursSpecification',
         'dayOfWeek': ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
         'opens': '09:00', 'closes': '20:00'},
        {'@type': 'OpeningHoursSpecification',
         'dayOfWeek': 'Friday', 'opens': '08:30', 'closes': '15:30'},
        # stating Saturday as closed beats leaving it out and letting Google guess
        {'@type': 'OpeningHoursSpecification',
         'dayOfWeek': 'Saturday', 'opens': '00:00', 'closes': '00:00'}
    ],
    'hasMenu': {
        '@type': 'Menu',
        'name': 'התפריט',
        'url': site + '/#menu',
        'inLanguage': 'he',
        'hasMenuSection': menu_sections
    }
}
if maps:
    restaurant['hasMap'] = maps.group(1).replace('&amp;', '&')

graph = [restaurant]
if faq:
    graph.append({'@context': 'https://schema.org', '@type': 'FAQPage',
                  '@id': site + '/#faq', 'mainEntity': faq})

payload = graph[0] if len(graph) == 1 else {'@context': 'https://schema.org', '@graph':
                                            [{k: v for k, v in g.items() if k != '@context'} for g in graph]}
out = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))

block = ('<script type="application/ld+json">' + out + '</script>')
new, n = re.subn(r'<script type="application/ld\+json">.*?</script>', lambda _: block, html, count=1, flags=re.S)
if n != 1:
    sys.exit('could not find exactly one ld+json block to replace')

io.open(PATH, 'w', encoding='utf-8').write(new)
print(f'sections: {len(menu_sections)}  dishes: {sum(len(v) for v in by_cat.values())} '
      f'({priced} priced)  faq: {len(faq)}  bytes: {len(out.encode())}')
