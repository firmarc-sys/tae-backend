# n8n workflow pack

Import these workflows into the Jahorin n8n instance. They are intentionally inactive in source control.

Activation order:
1. Create `Jahorin TAE Webhook` Header Auth credential.
2. Import low-risk workflows and test using n8n's Test URL.
3. Publish and use the Production URL only after TAE integration tests pass.
4. Configure Gmail/backend service credentials for high-risk workflows.
5. Activate high-risk workflows only after approval + Thoth verification tests pass.

Source of truth for workflow IDs: `../n8n-capability.js`.
