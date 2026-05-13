# Lessons Learned

## 0. ES module imports are hoisted — dotenv must run before any module that reads `process.env`

In ES modules, `import` statements are evaluated before any top-level code runs. If `auth.middleware.ts` imports `process.env.ADMIN_API_KEY` at the module level, it captures an empty string because `dotenv.config()` hasn't run yet. The fix: read `process.env` dynamically via a function called at request time, not at module load time.

## 1. TypeScript `rootDir` inference is a silent trap

With `module: "NodeNext"`, TypeScript infers `rootDir` from absolute file paths. On Windows, `D:\server\src\index.ts` produces `dist/server/src/` instead of `dist/`. Always set `rootDir` explicitly in `tsconfig.json`, or add a post-build flatten step.

## 2. Build scripts must be platform-agnostic

Using `tsc` directly (not `npx tsc`) breaks on Windows where `tsc` isn't in PATH. Always use `npx` for CLI tools in build scripts.

## 3. Route order matters in Express

Static routes like `/batch` must be defined *before* parameterized routes like `/:rank`, otherwise Express matches the param first.

## 4. The deploy script is only as good as the build output

The deploy script runs `npm run build` then restarts the service. If the build produces files in unexpected paths, the service silently runs stale code. The service file and build output must stay in sync.

## 5. 404s from a working build mean the service isn't using the new binary

When the compiled code was correct but the service still returned 404, the fix wasn't in the code — it was in the runtime path. Always verify the service is actually loading the freshly built files.

## 6. Dead code hunting is easier with `git log -S`

`git log -p -S "functionName"` finds exactly when a function was added or removed, saving you from manual bisecting.
