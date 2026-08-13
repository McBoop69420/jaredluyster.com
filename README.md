# Wizard Battle Website

This directory is tracked as its own Git repository, separate from the main Wizard Battle game/app repository in the parent folder.

## Files

- `index.html` - website landing page
- `shared-theme.css` - shared website styles
- `cards-data.js` - website card data
- `wizard-hat.png` - website asset
- `radio.html` - Jared Luyster Radio player page (now-playing widget + live stream)

## Radio

`radio.html` is a public player for a self-hosted internet radio station. The streaming
service itself is **not** in this repo — it lives in a separate private repo
(`McBoop69420/radio-service`) and runs on a persistent host with the local music files.

- Live stream: `https://radio.jaredluyster.com/stream.mp3`
- Status JSON: `https://radio.jaredluyster.com/status.json`
- `radio.html` polls the status endpoint every 15s for the current track + on-air state.

The static site (GitHub Pages) serves `radio.html` but cannot run the streaming service.
Deploy the radio service separately and point DNS / a reverse proxy at
`https://radio.jaredluyster.com/`.

## Marketplace payments

The marketplace uses PayPal Checkout with server-side order creation and capture.
Configure the client ID, client secret, and sandbox/live mode from the marketplace
admin settings. Deployment environment variables can override those settings:

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_ENVIRONMENT` (`sandbox` while testing, then `live`)
- `PAYPAL_CURRENCY` (`USD` by default)

The client secret must stay in the deployment environment or the protected settings
database and must not be committed.
The cart continues to support cash-at-pickup reservations when PayPal is unavailable.

## Source Control

Run Git commands from inside `website/` to manage the site history independently from the main game project.
