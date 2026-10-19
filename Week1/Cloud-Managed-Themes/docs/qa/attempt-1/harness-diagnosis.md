# Harness diagnosis

Original reports preserved here. No production source fixes were made.

- Chromium screenshot exceeded the 12-second evidence-capture timeout after fonts loaded; retry gives the screenshot operation 60 seconds without relaxing any layout/overflow assertion.
- Firefox W3C Element Clear changed the search value without the input event used by the real UI. Subsequent keyboard-preview failure was caused by the still-filtered hidden cards. Retry uses actual Control+A and Backspace through WebDriver.
- Firefox BiDi recorded NS_BINDING_ABORTED for superseded API reads during the concurrent-request test and a favicon canceled by navigation. These are classified and retained separately, not counted as 404s or uncaught runtime errors. All other transport failures still fail the check.
- Accessibility failures are genuine findings and remain failing checks.
