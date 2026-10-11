# Firestore Containment Lock

The deployment pre-hook accepts only the reviewed safe containment rules.
It performs no network requests or deployment. A different policy requires a
separate security review and an explicit update to the approved fingerprint.

Local checks:

```text
node --test scripts/security/verify-rules.test.cjs
node scripts/security/verify-rules.cjs
node scripts/security/verify-rules.cjs --staged
```

The GitHub workflow checks changes after it is pushed. It is not active on
GitHub merely because it exists locally. Require its status check in branch
protection after separately approving the push. Direct Firebase Console edits,
an alternate CLI configuration, or removal of the guard can bypass local
hooks; restrict Firebase IAM and protect this workflow and checker in review.

Never restore the old self-claimed membership rules as a rollback.
