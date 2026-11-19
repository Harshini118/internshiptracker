# NextOffer v2 - Simplify CSV verification + graded interview practice

This is a standalone, offline-first HTML web app. Open `index.html` in a modern browser. It does NOT need a password, account, or server.

## What's new

### Application tracking through Simplify Job Tracker exports

1. Sign in to Simplify normally, open your **Job Tracker**.
2. Choose **Export CSV** in the action row (see https://help.simplify.jobs/en/articles/2140179-use-the-job-tracker).
3. In NextOffer open **Applications** -> **Choose exported CSV**.
4. Check mappings for Company, Job title, Applied date, and Application status. The date MUST be the date of submission, not the date the record was last edited.
5. Click **Import and verify CSV**. NextOffer checks the saved vs. submitted status, counts submissions by application date, and updates your 5-a-day goal.
6. Whenever you apply to more jobs, **export again and re-import**. New exports replace the previous snapshot rather than double counting.

Important limitations:
- This is a manual, user-controlled import; **not a live Simplify API integration**. No public supported Simplify application-tracker API was established. The website does not access your Simplify login.
- Saved and draft jobs do NOT count toward the 5-a-day goal.
- Applications missing submission dates are excluded from date-based goals. Update their date in Simplify and export again.
- On dates represented by imported submissions, NextOffer uses the imported count rather than also adding manual logs. On dates absent from the export, existing manual logs are still used as fallback.
- Imported CSV data and study progress are stored only inside local browser storage for the website's origin. Backup regularly.
- Neither the app nor its logic contacts a server to process CSV data.

### Graded interview drills

Open **Interview lab**, pick Analytics / BI, Product data science, ML / AI, Product management, or Business analytics, and answer the 5-question practice quiz. The site grades answers locally, explains your mistakes, stores your history and completes the interview checkbox automatically. The 25-minute timer, spoken mock prompt and self-reported practice review are still available. There is no live execution of submitted Python/SQL code and no automatic grading of spoken answers.

## Upgrade from old NextOffer

Your old browser's `localStorage` might not carry between different local file paths or devices. Open the original NextOffer website, navigate to **Settings & backup**, and download the JSON. Then open the v2 website, go to **Settings & backup**, and **Import backup**. This merges the older fields into a newer default state. Then export a Simplify CSV and import it in Applications.

## Saving data

Use **Settings & backup -> Download backup JSON** frequently. The app is offline-first and does not provide a cloud account. Avoid clearing browser storage without downloading a backup first. No application is submitted by this app; apply in Simplify or on the employer site.

## Hosting

You can serve `index.html` from GitHub Pages or another static web host; it does not include authentication or a backend, so uploaded CSVs are parsed in your browser only. Hosting alone does NOT sync progress across browsers. Protect exported backups, because they contain private application information.
