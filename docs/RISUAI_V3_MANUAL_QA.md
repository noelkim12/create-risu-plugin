# Risuai v3 Manual QA Checklist

This checklist is supplementary manual QA for a human tester after automated smoke, build, and static checks pass. It is not an automated completion gate and it is not automated proof that the Risuai UI was tested.

Use it to confirm the generated plugin behaves correctly inside Risuai v3.

## Before You Start

- Build has already passed for the generated plugin project.
- You have access to a Risuai v3 app that can import or hot reload a plugin file.
- You know the built plugin path, usually `dist/<plugin>.js` from the generated project.

## Checklist

1. Build the plugin.
   - Step: From the generated plugin project, run `npm run build`.
   - Expected result: The command exits successfully and creates `dist/<plugin>.js`.

2. Import or select the built file in Risuai v3.
   - Step: Open Risuai v3, use the v3 plugin import or hot reload flow, and choose `dist/<plugin>.js`.
   - Expected result: Risuai accepts the file without an import error.

3. Verify the action button appears.
   - Step: Open the Risuai area that shows plugin action buttons registered through `registerButton`.
   - Expected result: An action button for the generated plugin appears with the generated plugin display name.

4. Open the panel.
   - Step: Click the plugin action button. If that button location is hidden by the current Risuai layout, open the plugin settings entry registered through `registerSetting` as a fallback.
   - Expected result: The plugin panel open action runs, Risuai opens the plugin container, and the iframe-local panel is visible.

5. Observe the open count increment.
   - Step: Note the displayed open count, close the panel, then open it again.
   - Expected result: The open count increases by one after each panel open.

6. Observe character and chat context display.
   - Step: While a character and chat are selected in Risuai, open the panel and inspect the context section.
   - Expected result: The panel shows the current character/chat context that Risuai exposes, such as character name or id and chat index or id. If Risuai has no active character or chat, the panel shows an empty or unavailable state rather than crashing.

7. Close the panel.
   - Step: Click the panel close control.
   - Expected result: The panel close action runs, `hideContainer` is called, and the plugin container closes without a visible error.

8. Optionally test file hot reload.
   - Step: Keep Risuai pointed at `dist/<plugin>.js`, make a small visible source change, run the build in watch mode or rebuild, then trigger the Risuai v3 file hot reload flow if needed.
   - Expected result: The updated plugin file is loaded by Risuai and the visible change appears after the hot reload or reimport step.

## Recording Results

Record each pass or failure with the Risuai version, generated framework, plugin file path, and any console or import errors. If this checklist is not executed, say that browser/UI execution was not performed and remains a manual follow-up.
