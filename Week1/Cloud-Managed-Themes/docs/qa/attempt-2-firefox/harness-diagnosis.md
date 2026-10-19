# Follow-up harness diagnosis

- Exact Firefox viewport sizes now verified via BiDi: 1920×1080, 768×1024, 390×844, and 320×900. All 56 combinations passed overflow assertions.
- Native WebDriver automatic scrolling placed a target at y=6 behind the sticky header. Follow-up centers the element by scrolling before a native click; it does not force or JavaScript-click the control.
- Follow-up keyboard checks move the pointer outside menus and await finite opening animations, with full focused-element diagnostics on failure.
- This does not waive any accessibility findings or change the published site.
