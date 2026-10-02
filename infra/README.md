# Infrastructure migration

Review and apply infrastructure definitions in non-production first. Reference or import existing Cloud Run resources deliberately; do not create replacements or alter production traffic by default. Use Secret Manager for secrets. Require a reviewed infrastructure plan, migration/rollback plan and post-deploy smoke tests.
