# Features

Feature modules contain testable business logic. They should avoid importing React, React Native, or Expo modules.

- `src/features/*/core` should be mostly pure functions.
- `src/infra/*` contains concrete implementations (axios, secure store, SignalR).
- Screens in `app/` should call feature APIs and keep side effects/UI concerns local.
