# Keep a single monorepo with the three project folders in place

Agapay is three projects (`Agapay/` mobile/web app, `agapay-admin/` portal, `agapay-backend/` API) that share one wire contract: error shapes, role names, JSON casing and SignalR hub URLs. We keep them in one repository rather than splitting into one repo per project, so a contract change and its consumers land in a single commit and a single review.

We also keep the folder names and positions as they are, rather than regrouping under `apps/` or renaming. Railway, Vercel and EAS configuration, and the evaluator-facing setup steps in the root `README.md`, all reference these paths; moving them would break deployment and evaluation for no functional gain. Agent-friendliness is achieved instead by keeping the root and each project's top level minimal and by one router `AGENTS.md` that states shared contracts once.

## Consequences

- Shared contracts are documented only in the root `AGENTS.md`; project instruction files link to it.
- Revisit only if a project needs an independent release cadence or access boundary.
