# pfui playground

Manual testing: a dashboard of scenarios, each on its own page.

```sh
npm run playground            # dev server (http://localhost:5173); edits reload the page
npm run playground:preview    # production build (prerendered dashboard) + preview server
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

   Then add the route to `<Pages>`:

   ```xml
   <Page url="/clock"><ClockScenario/></Page>
   ```

3. **Update `e2e/playground.spec.ts`:** add the title to its list of
   expected dashboard buttons. It opens every scenario and fails on any
   page or console error.

## Things to know

- **The header is a sibling of the content, not a wrapper.** Content passed
  into another component's `<Slot>` is compiled as a template, and `id`s
  inside templates are not supported yet (E014).
- **A page's state starts fresh on every visit:** only the active page is
  mounted.
- **The app's theme and tone are shared by every page** (`toggleThemeTone()`
  persists while you navigate).
- **Compile errors** show in Vite's overlay, with the file, line and
  column.
