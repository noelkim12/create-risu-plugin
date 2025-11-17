# React Plugin Development Guide

## 🎯 Core Architecture Principles

### Dialog Management - Singleton Root Pattern

**IMPORTANT**: All dialogs MUST use the singleton dialog root to prevent memory leaks.

**Location**: `src/ui/utils/dialog-root.js`

#### ✅ Correct Usage

```jsx
import { renderDialog } from '../../utils/dialog-root.js';

// Component
export function MyDialog({ message, onDialogComplete }) {
  const handleAction = () => {
    if (onDialogComplete) {
      onDialogComplete(resultData);
    }
  };

  return <div>{/* dialog UI */}</div>;
}

// Export function
export async function showMyDialog(message) {
  const result = await renderDialog(<MyDialog message={message} />);
  return result;
}
```

#### ❌ Wrong Usage - DO NOT DO THIS

```jsx
// NEVER create new ReactDOM roots for dialogs
import ReactDOM from 'react-dom/client';

export function showMyDialog(message) {
  const container = document.createElement('div');  // ❌ Memory leak
  const root = ReactDOM.createRoot(container);      // ❌ Performance issue
  root.render(<MyDialog />);                        // ❌ Multiple roots
}
```

### Key Rules

1. **Single Dialog Root**: All dialogs share ONE React root (`#risu-plugin-dialog-root`)
2. **Main App Root**: Separate root for main app (`#risu-plugin-root`)
3. **Async Pattern**: Always use `async/await` with `renderDialog()`
4. **onDialogComplete**: Use this prop name for consistency
5. **Cleanup**: Dialog root auto-cleans on `risuAPI.onUnload()`

### Architecture Overview

```
Browser DOM
├─ #risu-plugin-root          → Main App Root (MutationObserver)
└─ #risu-plugin-dialog-root   → Singleton Dialog Root (reusable)
   └─ Current Dialog Component
```

### Adding New Dialogs

1. Create component with `onDialogComplete` prop
2. Implement cleanup logic inside component (timers, listeners)
3. Export async function using `renderDialog()`
4. Never import `ReactDOM` in dialog components

### Update Management - Context/Hook Pattern

**IMPORTANT**: Use Context API pattern to eliminate props drilling and separate concerns.

**Architecture**: `Core Logic → Domain Objects → Context → Hook → Components`

#### Core Structure

```
src/
├── core/
│   ├── update-core.js          → Pure logic (no React)
│   ├── update-types.js         → Domain models
│   └── update-manager.jsx      → UI integration
└── ui/
    └── contexts/
        └── UpdateContext.jsx   → Context + Provider + Hook
```

#### ✅ Correct Usage - Using the Hook

```jsx
import { useUpdateManager } from '../contexts/UpdateContext.jsx';

function MyComponent() {
  const { checkForUpdates } = useUpdateManager();

  const handleUpdateCheck = async () => {
    await checkForUpdates({
      pluginName: PLUGIN_NAME,
      currentVersion: PLUGIN_VERSION,
      i18n: { /* optional */ },
      silent: false,
    });
  };

  return <button onClick={handleUpdateCheck}>Check Updates</button>;
}
```

#### ✅ Correct Usage - Domain Objects

```jsx
import { createUpdateInfo, createUpdateTexts } from '../core/update-types.js';
import { confirmUpdate } from '../core/update-manager.jsx';

async function myFunction(manifest) {
  // Create domain objects
  const info = createUpdateInfo({
    name: PLUGIN_NAME,
    currentVersion: PLUGIN_VERSION,
    manifest,
  });

  const texts = createUpdateTexts({
    title: 'Custom Title',
    primary: 'Update Now',
  });

  // Use domain objects (no props drilling!)
  const result = await confirmUpdate({ info, texts });
}
```

#### ❌ Wrong Usage - Props Drilling

```jsx
// DON'T pass 10+ individual props
<UpdateDialog
  name={name}
  currentVersion={currentVersion}
  version={version}
  releasedAt={releasedAt}
  mandatory={mandatory}
  notes={notes}
  title={title}
  btnUpdate={btnUpdate}
  btnLater={btnLater}
  btnSkip={btnSkip}
/>

// DO use domain objects
<UpdateDialog info={info} texts={texts} />
```

#### Key Rules - Update Management

1. **Separation of Concerns**: Pure logic in `update-core.js`, React in `update-manager.jsx`
2. **Domain Objects**: Use `createUpdateInfo()` and `createUpdateTexts()` to bundle related data
3. **Context Access**: Always use `useUpdateManager()` hook, never import `checkForUpdates` directly
4. **Provider Wrapping**: `<UpdateProvider>` must wrap components that use the hook
5. **Props Simplification**: Pass `{ info, texts }` instead of 10+ individual props

#### Domain Objects

**UpdateInfo** (from `createUpdateInfo()`):
- `name`, `currentVersion`, `latestVersion`
- `mandatory`, `releasedAt`, `notes`, `url`

**UpdateTexts** (from `createUpdateTexts()`):
- `title`, `primary`, `later`, `skip`

### Initialization Management - Context/Hook Pattern

**IMPORTANT**: Use Context API pattern for plugin initialization and lifecycle management.

**Architecture**: `Core Logic → Context → Hook → Components`

#### Core Structure

```
src/
├── core/
│   └── initialization-core.js  → Pure initialization logic (no React)
└── ui/
    └── contexts/
        └── InitializationContext.jsx → Context + Provider + Hook
```

#### ✅ Correct Usage - Using the Hook

```jsx
import { useInitialization } from '../contexts/InitializationContext.jsx';

function MyComponent() {
  const { risuAPI, isReady, error } = useInitialization();

  useEffect(() => {
    if (!isReady || !risuAPI) return;

    // risuAPI를 사용한 로직
    console.log('Plugin ready!');
  }, [risuAPI, isReady]);

  return <div>...</div>;
}
```

#### ❌ Wrong Usage - Direct API Access

```jsx
// DON'T import RisuAPI directly in components
import { RisuAPI } from '../../core/risu-api.js';

function MyComponent() {
  const risuAPI = RisuAPI.getInstance(); // ❌ Wrong
  // ...
}

// DO use the hook
import { useInitialization } from '../contexts/InitializationContext.jsx';

function MyComponent() {
  const { risuAPI } = useInitialization(); // ✅ Correct
  // ...
}
```

#### Key Rules - Initialization Management

1. **Provider Wrapping**: `<InitializationProvider>` must be at the root level
2. **Hook Access**: Always use `useInitialization()` hook, never access RisuAPI directly
3. **Ready Check**: Always check `isReady` before using `risuAPI`
4. **Error Handling**: Handle `error` state for initialization failures
5. **Cleanup**: Use `Cleanup` component pattern for resource cleanup

#### Initialization State

**useInitialization() returns**:
- `risuAPI`: RisuAPI instance (null until ready)
- `isReady`: Boolean indicating initialization completion
- `error`: Error object if initialization failed (null otherwise)

### Entry Point Pattern

**Location**: `src/index.jsx`

The `main()` function is now minimal - Provider handles all initialization:

```jsx
function main() {
  const container = ensureRootContainer(ROOT_ID);
  const root = ReactDOM.createRoot(container);

  root.render(
    <React.StrictMode>
      <InitializationProvider
        pluginName={PLUGIN_NAME}
        pluginVersion={PLUGIN_VERSION}
        isDev={__DEV_MODE__}
      >
        <UpdateProvider>
          <UpdateChecker />
          <Cleanup container={container} root={root} />
          <App />
        </UpdateProvider>
      </InitializationProvider>
    </React.StrictMode>,
  );
}

main();
```

### Performance Best Practices

- **Minimize Roots**: 2 roots total (main + dialog)
- **Reuse Patterns**: Use singleton root for all modals/dialogs
- **Cleanup**: Always cleanup in `risuAPI.onUnload()`
- **async/await**: Prefer over Promise chains

### Browser Compatibility

- **process.env.NODE_ENV**: Replaced at build time (vite.config.js)
- **UMD Format**: Single file with React bundled

---

**Last Updated**: React Template v1.0
**Total Roots**: 2 (main + dialog singleton)
**Memory Efficiency**: ~90% reduction in root creation
