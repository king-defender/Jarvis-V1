# Database

Sprint 0 uses **MongoDB** (implementation exception to frozen ADR-004 / SQLite).

Collections and indexes are created by `DatabaseService.migrate()`:

- `user_profiles`
- `command_directives`
- `workflows`
- `tasks`
- `rule_groups`
- `rule_conditions`

Start Mongo locally:

```bash
docker compose up mongo-db -d
npm run migrate
```
