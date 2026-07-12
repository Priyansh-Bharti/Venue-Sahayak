# Venue Sahayak Tests

This project includes isolated unit tests for the core logic, and integration tests for the Cloud Functions endpoints. We use Jest configured for ES Modules execution.

## Running Tests

To run all tests:

```bash
npm run test
```

To run tests with a code coverage report:

```bash
npm run test:coverage
```

You can also run specific layers of the test suite:

```bash
npm run test:unit         # Core isolated logic
npm run test:integration  # Endpoint orchestration
npm run test:frontend     # Client-side JS and UI
npm run test:security     # Firebase Security Rules
npm run test:a11y         # Accessibility and WCAG testing
```

## Structure and Coverage

The test suite consists of **202 total exact tests** (214 total including 12 skipped security tests locally) validating every aspect of the codebase. Our testing philosophy divides responsibilities across specialized layers:

| File                                                       | Test Count | Focus Area                                                                       |
| ---------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------- |
| `tests/unit/gemini.test.js`                                | ~40        | Validates Generative AI flow, tool-calling loop, prompt adherence, error states. |
| `tests/unit/firestore.test.js`                             | ~35        | Validates the data access layer, fuzzy matching, schema, and enum boundaries.    |
| `tests/unit/validation.test.js`                            | ~28        | Validates HTTP payload shapes, input sanitization, and edge cases.               |
| `tests/integration/chat-endpoint.test.js`                  | ~36        | Validates `/chat` HTTP wrapper and robust in-memory rate-limiting.               |
| `tests/integration/admin-endpoint.test.js`                 | ~8         | Validates `/updateCrowdLevel` HTTP wrapper error codes and responses.            |
| `tests/frontend/chat.test.js`                              | ~11        | Verifies client-side DOM interactions and optimistic UI updates for chat.        |
| `tests/frontend/map.test.js`                               | ~20        | Verifies client-side DOM interactions and Google Maps mocked logic.              |
| `tests/accessibility/accessibility.test.js`                | ~12        | Programmatic verification of WCAG compliance and ARIA attributes (jest-axe).     |
| `tests/security/security.test.js`                          | 12         | Tests Firebase Security Rules. (Skipped locally if lacking Java for emulators).  |
| _(Note: Counts include parameterized `.each` executions.)_ |

### Coverage Metrics

The current test suite provides the following coverage metrics (from exact coverage output):

- **Overall Lines**: 97.05%
- **Overall Statements**: 96.57%
- **Overall Branches**: 95.00%
- **Overall Functions**: 90.00%
- **`gemini.js`**: 100% Lines, 98.03% Statements, 96.42% Branches, 87.5% Functions
- **`firestore.js`**: 100% Lines, 100% Statements, 95.45% Branches, 100% Functions

> For full granular breakdown of the tests and coverage highlights, see [COVERAGE_SUMMARY.md](COVERAGE_SUMMARY.md).

## Testing with Firebase Emulator Suite

If you want to manually test the API or frontend locally with a local instance of Firestore and Cloud Functions, you can launch the Firebase emulator suite:

1. Setup Google Application Default Credentials or run `export GEMINI_API_KEY="your-key-here"`.
2. Start the suite from the root directory:
   ```bash
   firebase emulators:start
   ```
3. Open the emulator UI (usually `http://localhost:4000`) to inspect logs and manipulate Firestore data manually.
4. The frontend will be served locally (usually `http://localhost:5000`) and will automatically connect to the local emulators via the configuration provided in `firebase.json`.
