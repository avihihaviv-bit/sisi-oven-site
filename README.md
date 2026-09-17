# התנור של סבתא סיסי

אתר תדמית סטטי למסעדה. עמוד אחד, בלי שרת, בלי מסד נתונים, בלי שלב בנייה.
כל מה שבתיקייה הזו הוא האתר עצמו, וזה גם בדיוק מה שעולה ל-Vercel.

## מבנה הפרויקט

```
index.html          העמוד
404.html            דף שגיאה מעוצב
assets/             סרטון, תמונות, פונטים מקומיים, CSS ו-JS
  hero-scrub.mp4      סרטון הפתיחה (H.264)
  hero-scrub.webm     גיבוי VP9 לדפדפנים בלי H.264
  hero-poster.jpg     פריים ראשון, מוצג עד שהסרטון נטען
  hero-ending.jpg     הפריים האחרון, משמש כשאין אנימציה
  fonts/              חמישה קבצי woff2 מקומיים
vercel.json         כותרות אבטחה, קאשינג ודף 404 ב-Vercel
.htaccess           אותן הגדרות לשרת Apache או LiteSpeed, למשל Hostinger
set-domain.sh       מזין את הדומיין הסופי לכל הקבצים שצריכים כתובת מלאה
robots.txt          הנחיות למנועי חיפוש
sitemap.xml         מפת האתר
```

אין `package.json` ואין `node_modules` בכוונה. אין מה לבנות, ולכן אין גם
תלויות שיכולות להישבר או להתיישן.

## העלאה ל-Vercel

**דרך GitHub (מומלץ, כי כל דחיפה מתפרסמת אוטומטית)**

ב-Vercel: Add New ואז Project ואז Import מהריפו. בהגדרות:

| שדה | ערך |
| --- | --- |
| Framework Preset | `Other` |
| Root Directory | `sisi-oven-site` |
| Build Command | ריק |
| Output Directory | ריק |
| Install Command | ריק |

Vercel יזהה אתר סטטי ויגיש את התיקייה כמו שהיא.

**גרירה, בלי Git**

Add New ואז Project ואז Deploy without Git, וגוררים את התיקייה הזו.

**משורת הפקודה**

```bash
npm i -g vercel
cd sisi-oven-site
vercel            # תצוגה מקדימה
vercel --prod     # לייב
```

## אחרי שיש דומיין קבוע

יש ארבעה מקומות שצריכים כתובת מלאה: `canonical`, `og:url`, `og:image`,
`twitter:image`, ובנוסף `robots.txt` ו-`sitemap.xml`. סקריפט אחד עושה את הכל:

```bash
./set-domain.sh https://the-real-domain.co.il
git commit -am "set live domain" && git push
```

בלי זה האתר עובד, אבל תצוגה מקדימה של הקישור בוואטסאפ ובפייסבוק לא תראה תמונה,
כי הסורקים דורשים כתובת מלאה ולא יחסית.

ב-Vercel מוסיפים את הדומיין ב-Settings ואז Domains. התעודה והפניית ה-HTTPS
נוצרות אוטומטית.

## מה vercel.json עושה

- **CSP נוקשה**: `default-src 'self'` בלי `unsafe-inline` ובלי `unsafe-eval`.
  אין באתר אף `<style>` פנימי, אף `style="..."` ואף סקריפט פנימי, ולכן המדיניות
  הזו מתקיימת בלי פשרות. אם מוסיפים בעתיד קוד פנימי, הוא ייחסם עד שיעודכן כאן.
- **כותרות אבטחה**: nosniff, מניעת הטמעה באתר אחר, HSTS, Referrer-Policy,
  Permissions-Policy שסוגרת מיקום, מצלמה, מיקרופון ותשלומים.
- **קאשינג**: `assets/` לשנה, העמוד עצמו תמיד טרי, כדי ששינוי תוכן ייראה מיד.
- **404**: Vercel מגיש את `404.html` לכל כתובת שלא קיימת.

## בדיקה מקומית

```bash
cd sisi-oven-site
python3 -m http.server 8000
```

ואז http://localhost:8000. פתיחה של `index.html` בקליק כפול תציג תמונה סטטית
במקום סרטון, כי דפדפנים חוסמים טעינת קבצים מקומיים בצורה הזו. זה מצב מכוון
והעמוד שלם גם בו.

## דברים לאשר מול בעל העסק לפני פרסום

- תעודת כשרות בתוקף, כי המילה כשר מופיעה באתר
- מספר טלפון וקישור אתר ההזמנות
- מחירי התבשילים שמסומנים כרגע "בטלפון"
- מספר ח.פ או עוסק מורשה לפרטי העסק
- שם ופרטי רכז נגישות להצהרת הנגישות
