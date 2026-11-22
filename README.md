# patchfuil (pfui)

A declarative, reactive UI framework: applications are written as XML markup
(`.pfui` files) with a sandboxed JavaScript subset, and **compiled** to
JavaScript that renders with React and Mantine.

patchfuil is a re-invention of [XMLUI](https://xmlui.org): it keeps XMLUI's
concepts and markup syntax, and replaces the implementation. Expressions and
handlers are compiled instead of interpreted, there is no runtime change
detection, and startup is fast.

**Status:** early proof-of-concept. Only the markup parser exists so far.

## Development

```sh
npm install
npx playwright install chromium   # once, for E2E tests
npm run check                      # typecheck + unit tests + E2E tests
```

The development documentation starts at
[.ai/docs/code-structure.md](.ai/docs/code-structure.md). Plans and the
roadmap are in [.ai/plan/](.ai/plan/).
