# Jahorin GID origin hotfix

The production hotfix workflow deploys the current ARI image with `authorization-gateway.js` as the Cloud Run edge and explicitly restores the canonical browser origins, including `https://jahorin-ga.vercel.app`.

The workflow proves browser preflight, invalid-GID error transport, unauthenticated session transport, and billing catalog access from the Jahorin Vercel origin before reporting success.
