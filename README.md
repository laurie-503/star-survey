# Club Athletic — 5-Star Text Survey

A one-question, tap-the-stars survey, built to be texted as a link and hosted
on Cloudflare Workers. No app, no login — the customer taps a link in a text,
taps 1-5 stars, optionally adds a comment, done.

This does **not** post anything to Google. (Google doesn't allow a third
party to submit or pre-fill a review on someone's behalf — see the note at
the bottom.) This is purely your own feedback channel.

## What's in here

- `src/index.js` — the Worker: serves the survey page and saves responses.
- `schema.sql` — the one database table this needs.
- `wrangler.toml` — Cloudflare config.

## 1. Fill in your locations

Open `src/index.js` and fill in the `name` for each location code in the
`LOCATIONS` object near the top:

```js
const LOCATIONS = {
  LSA: { name: "" },   // <- put the real name here, e.g. "Lower East Side"
  OTA: { name: "" },
  ...
};
```

Only codes listed in `LOCATIONS` will work as a `?loc=` value — this is also
what keeps random/garbage links from loading a page.

You can also edit `QUESTION_TEXT` near the top if you want something other
than "How was your visit today?".

## 2. Deploy it

You'll need [Node.js](https://nodejs.org) and a Cloudflare account (you
already have one, since this reuses your existing Workers setup).

```bash
cd review-survey-worker
npm install -g wrangler        # skip if you already have it
wrangler login

# Create the database (one time)
wrangler d1 create ca-star-survey-db
# -> copy the "database_id" it prints into wrangler.toml

# Create the table
wrangler d1 execute ca-star-survey-db --remote --file=./schema.sql

# Deploy
wrangler deploy
```

Wrangler will print your live URL, something like:
`https://ca-star-survey.<your-subdomain>.workers.dev`

## 3. The link format

```
https://ca-star-survey.<your-subdomain>.workers.dev/survey?loc=WVA&cid=12345
```

- `loc` — required, one of your 10 location codes.
- `cid` — optional, a GoHighLevel contact ID (or anything else you want
  attached to the response, like a member ID). It's just stored alongside
  the rating so you can match it back to a person later — not required.

## 4. Sending it from GoHighLevel

In the workflow that should trigger this (e.g. "2 hours after a class" or
"day after first visit"):

1. Add an **SMS** action.
2. Use a merge field for the location code if you track it on the contact
   (e.g. a custom field `location_code`), or hardcode a separate workflow
   per location if that's simpler.
3. Message body, e.g.:

   ```
   Hi {{contact.first_name}}, got a sec? Quick 1-question survey:
   https://ca-star-survey.<your-subdomain>.workers.dev/survey?loc={{contact.location_code}}&cid={{contact.id}}
   ```

That's the only GHL-side change needed — everything else happens on the
Worker.

## 5. Getting the data back out

Every response is a row in the `survey_responses` table (location, rating,
comment, contact id, timestamps). To pull it:

```bash
wrangler d1 execute ca-star-survey-db --remote \
  --command="SELECT * FROM survey_responses ORDER BY created_at DESC LIMIT 50"
```

There's also a lightweight JSON export built in, off by default. To turn it
on:

```bash
wrangler secret put ADMIN_KEY
```

Then:

```bash
curl -H "x-admin-key: YOUR_KEY" \
  "https://ca-star-survey.<your-subdomain>.workers.dev/api/responses?limit=100"
```

That JSON is in the right shape to feed into a dashboard later, the same way
your other dashboards pull from their data sources.

## On the Google review question

Google doesn't let any outside tool submit a review for someone, or preset
the star count — the person has to open Google's own review box, pick the
stars themselves, write their own words, and hit submit under their own
Google account. Doing it any other way risks your Business Profile getting
flagged for "fake engagement."

Since you already have the direct link to each location's Google review
page, the simplest way to use it is to text that link on its own (separate
from this survey) when you want someone to leave a public review. If you
ever want this survey to *lead into* that — e.g. only showing the Google
link after someone taps 4 or 5 stars — that's a small addition to
`index.js` (a button on the "thanks" screen), just say the word.
