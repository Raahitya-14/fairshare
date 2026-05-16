# FairShare

A dependency-free expense splitting web app that can be hosted directly on GitHub Pages.

## Features

- Create groups
- Add members
- Add shared expenses
- Split expenses equally between selected members
- Choose a group currency, including USD, EUR, SEK, INR, GBP, CAD, AUD, JPY, and more
- Show per-person balances
- Simplify who should pay whom
- Persist data in browser `localStorage`
- Create Supabase-backed shared groups that can be opened from another phone
- Export and import JSON backups

## Supabase setup

1. Open your Supabase project.
2. Go to **SQL Editor**.
3. Paste and run the contents of `supabase-schema.sql`.
4. Open `index.html`.
5. Create a new group.
6. Click **Copy link** and open that link on another phone.

Anyone with a copied group link can view and edit that group. Keep the link private.

## Run locally

Open `index.html` in a browser.

## Deploy on GitHub Pages

1. Push these files to a GitHub repository.
2. Open the repository settings.
3. Go to **Pages**.
4. Choose the branch that contains these files.
5. Set the folder to `/root`.
6. Save.

GitHub will publish the app as a static site.
