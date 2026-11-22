# Assessment submission checklist

Update this checklist as the assessment is prepared for submission. The included synthetic workbook is for a clearly disclosed demo; it is not operational data. Do not submit the retired static demo URL as the full-stack application.

## Current status

- [x] Full-stack source pushed to the public GitHub repository.
- [x] PostgreSQL schema and initial migration committed.
- [x] TypeScript, ESLint, and optimized Next.js build pass locally.
- [x] Start the local Docker PostgreSQL service and apply the migration.
- [x] Import and review the labeled synthetic workbook; verify draft generation, leave handling, backup coverage, and publication.
- [ ] Select a public host and connect its PostgreSQL database and environment variables.
- [ ] Deploy the app to the selected host and verify it over HTTPS.
- [ ] Record and share a 3–5 minute walkthrough of the deployed app using `DEMO_SCRIPT.md`.
- [ ] Add the user's LinkedIn profile URL.
- [ ] Replace the full-name placeholder in the email subject.
- [ ] Confirm the assessment recipient and CC addresses before sending.

## Submission details

- **Application:** Local demo at `http://localhost:3002`; public URL pending deployment
- **Repository:** https://github.com/bithemant/rosterly-smart-roster
- **Demo video:** Pending screen recording of the deployed app; disclose synthetic records if used
- **LinkedIn:** Add your profile URL
- **Approach note:** `APPROACH.md`
- **Subject:** `Smart Roster Management System Assignment - [Your Full Name]`

## Before recording

1. Configure the selected host's PostgreSQL service and apply the committed migration.
2. Set a private `SETUP_TOKEN`, create the first administrator, and import the anonymized workbook or clearly disclose the synthetic demo workbook.
3. Configure the AI provider only if you plan to demonstrate AI; keep the API key in server-side environment settings.
4. Verify account scopes, draft generation, one manual change, availability review, publication validation, and CSV export.
5. Record from the deployed URL without exposing credentials or personal data.
