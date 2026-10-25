# Plan: Add user login, email support, interested categories, and auto-categorization

## Auth
We will add a user login system with email support. We should store users in the existing SQLite database rather than use an external auth provider, to keep the stack self-contained.
Passwords will be hashed with bcrypt (or argon2) before storage. TBD: should email verification be required before login, or optional?

## Registration flow
During registration we will collect a set of interested news categories from the user. The category list will be predefined (e.g., tech, finance, sports, science, politics, entertainment) instead of free-form, so the crawler can match against consistent labels.
We could make category selection optional at registration and let users configure it later, or require at least one category before completing signup.

## Data model
We will add a `users` table and a `user_categories` join table to store selected interests.
For auto-categorization, we will add a `categories` column on the `articles` table. The crawler will tag articles at fetch time based on keyword rules and optionally fall back to the source's existing `category` field.

## Crawler / categorization
When crawling RSS feeds, we will automatically assign category tags to each article. The approach is a hybrid: keyword matching in the title/summary first, then fallback to the source's category if no keywords match.
Trade-off: rule-based tagging is fast and deterministic but less accurate than ML; ML is better but adds latency and dependencies.

## API / frontend
New routes: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`.
Frontend: add login/register forms and a category selector. The existing news list can be filtered by the user's interested categories.
