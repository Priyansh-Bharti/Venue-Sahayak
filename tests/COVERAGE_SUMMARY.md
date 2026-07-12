# Test Coverage Summary

This document summarizes the coverage metrics for Venue Sahayak, reflecting the depth of unit and integration testing across the codebase.

## Overall Coverage Metrics

| Metric         | Percentage |
| -------------- | ---------- |
| **Statements** | 96.57%     |
| **Branches**   | 95.00%     |
| **Functions**  | 90.00%     |
| **Lines**      | 97.05%     |

## Module Breakdown

### `firestore.js`

- **Statements**: 100%
- **Branches**: 95.45%
- **Functions**: 100%
- **Lines**: 100%
- **Uncovered Lines**: 5 (Module init boilerplate / specific edge-case fallbacks)

### `gemini.js`

- **Statements**: 98.03%
- **Branches**: 96.42%
- **Functions**: 87.5%
- **Lines**: 100%
- **Uncovered Lines**: 139 (Hard-to-reach error formatting paths)

### `index.js`

- **Statements**: 93.33%
- **Branches**: 94%
- **Functions**: 75%
- **Lines**: 93.1%
- **Uncovered Lines**: 60-63 (Interval unref lifecycle cleanup that doesn't trigger fully inside isolated JSDOM/Jest instances)

## Highlights

- **202 Total Tests**: Expanding far beyond basic execution to cover off-topic filtering, rate-limits, validation bounds, upstream outages, and prompt injection attempts.
- **Robustness**: 100% line coverage for critical path data access (`firestore.js`) and complex LLM retry orchestration (`gemini.js`).
- **Resiliency Focus**: Deeply covers HTTP 400, 415, 429, and 503 error boundaries.
