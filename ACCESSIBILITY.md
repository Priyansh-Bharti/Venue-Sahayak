# Venue Sahayak - Accessibility & Robustness Review

This document summarizes the accessibility and robustness features implemented across the Venue Sahayak application to ensure an inclusive and resilient user experience.

## 1. Screen Reader Compatibility & ARIA Roles

- **Keyboard Navigation & Labels:** All interactive elements, including sidebar buttons, navigation items, map controls, and chat inputs, have been updated with descriptive `aria-label`s.
- **Live Regions:** The chat thread (`#chat-thread`) is marked with `aria-live="polite"` and `aria-atomic="false"` so that screen readers announce new assistant responses dynamically without interrupting the user.
- **Status Announcements:** The animated typing indicator has an `aria-label="Assistant is typing..."` and `role="status"` to ensure screen readers recognize when the AI is processing a request.
- **Toggle States:** The voice input (microphone) button correctly implements `aria-pressed="true"` while recording and reverts to `false` when stopped. Admin dashboard segmented controls also dynamically manage the `aria-pressed` state for current crowd levels.

## 2. Color Contrast (WCAG AA Compliance)

- Verified that all primary text on surfaces and text on primary backgrounds (`text-on-surface`, `text-on-primary`, `text-on-surface-variant` against their respective backgrounds) meet or exceed the WCAG AA contrast ratio of 4.5:1.
- The Material 3 Tailwind color tokens maintain high-contrast legibility across all components.

## 3. Data Visualization & Color Independence

- **Map Pins:** Crowd levels on the map use distinct pin colors (green, amber, red), but the interactive `InfoWindow` explicitly lists the crowd status in text ("Low", "Medium", "High") to ensure it is not reliant on color alone.
- **Admin Dashboard:** Segmented controls combine distinct Material Symbols (icons) and descriptive text labels alongside their active color states.

## 4. Graceful Degradation & Fallbacks

- **Maps API:** If the Google Maps API fails to load due to network restrictions, the map UI falls back gracefully. It replaces the map container with a prominent error state and message, preventing a silent blank screen.
- **Web Speech API:** The browser is checked for Web Speech API (`SpeechRecognition` or `webkitSpeechRecognition`) support on load. If unavailable, the microphone button is gracefully hidden rather than throwing exceptions or acting unresponsive.

## 5. Dynamic Language Tagging

- Added a lightweight, naive language detection utility in `chat.js` that inspects the assistant's reply for character blocks (e.g., Devanagari, Arabic, CJK).
- The `<html>` tag's `lang` attribute is updated automatically upon receiving a response to help screen readers switch pronunciation profiles on the fly.

## 6. Responsiveness

- Maintained and verified the Tailwind CSS breakpoints (`md:hidden`, `hidden lg:flex`, `hidden xl:flex`).
- The application scales gracefully: the sidebar converts to a fixed bottom navigation bar on mobile, and the map cleanly hides/collapses into a drawer or tab logic as dictated by the Stitch mobile breakpoint designs.
