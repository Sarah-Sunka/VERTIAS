# VERTIAS

Veritas Intelligence website: static HTML, CSS, and JavaScript with a Vercel serverless endpoint that relays investigation questions to Make.com.

## Deploy

The site is deployed on Vercel. The Make.com webhook is stored in the `MAKE_WEBHOOK_URL` environment variable and is never committed to this repository.

The contact form uses Web3Forms and requires a `WEB3FORMS_ACCESS_KEY` value in `assets/main.js`, or it falls back to preparing an email draft.
