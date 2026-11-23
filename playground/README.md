# pfui playground

Manual testing: a dashboard of scenarios, each on its own page.

```sh
npm run playground            # dev server (http://localhost:5190); edits reload the page
npm run playground:preview    # production build (prerendered dashboard) + preview (http://localhost:5191)
```

Routes use the hash (`/#/counter`), so any page can be bookmarked or reloaded.

## Adding a scenario

1. **Create `src/components/<Name>Scenario.pfui`.** Start with `ScenarioHeader`,
   then the scenario's own content:

   ```xml
   <Component name="ClockScenario">
     <Stack gap="16px">
       <ScenarioHeader title="Clock" description="What this scenario checks."/>
       <Stack var.time="{new Date().toLocaleTimeString()}">
         <Button label="Refresh" onClick="time = new Date().toLocaleTimeString()"/>
         <Text>{time}</Text>
       </Stack>
     </Stack>
   </Component>
   ```

   - **The `title` should match the dashboard entry.** The smoke test
     checks it.
   - **Code-behind** goes in `src/components/<Name>Scenario.pfui.xs`: top-level
     `var` and `function` only.

2. **Add an entry to `scenarios` in `src/Main.pfui`:**

   ```js
   { path: '/clock', title: 'Clock', description: 'What it checks.' },
   ```

   Then add its page to `<Pages>`, with its source below it:

   ```xml
   <Page url="/clock">
     <Stack gap="24px"><ClockScenario/><ScenarioSource file="ClockScenario"/></Stack>
   </Page>
   ```

3. **Update `e2e/playground.spec.ts`:** add the title to its list of
   expected dashboard buttons. It opens every scenario, checks that its
   source is shown, and fails on any page or console error.

## Things to know

- **`ScenarioSource`** (`src/react/ScenarioSource.tsx`) is the playground's own
  React component, used from markup. It is registered with the pfui Vite
  plugin's `extensions` option (`vite.config.ts`), with its metadata (its
  props are checked like a built-in's). It reads the sources with
  `import.meta.glob(…, { query: "?raw" })`.
- **IDs inside slot content** (or any template) belong to that content's
  instance: a scenario's content could also be wrapped in a component with a
  `<Slot/>`.
- **A page's state starts fresh on every visit:** only the active page is
  mounted.
- **The app's theme and tone are shared by every page:**
  `toggleThemeTone()` persists while you navigate.
- **Compile errors** show in Vite's overlay, with the file, line and
  column.
