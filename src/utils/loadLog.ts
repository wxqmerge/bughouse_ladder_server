import { getTimestamp } from '../../shared/utils/timeUtils';

/**
 * In-memory log buffer that captures console output during file loading.
 * Enables saving the loading log to a file when errors occur.
 */

const buffer: string[] = [];
let active = false;

/** Start capturing console output. Call before loading a file. */
export function startCapture(): void {
  if (active) return;
  active = true;
  buffer.length = 0;
  capture(`=== Load log started at ${getTimestamp()} ===`);
}

/** Stop capturing and return the log content as a string. */
export function stopCapture(): string {
  active = false;
  capture(`=== Load log ended at ${getTimestamp()} ===`);
  return buffer.join('\n');
}

/** Return the current log content without stopping capture. */
export function getLog(): string {
  return buffer.join('\n');
}

/** Check if capture is currently active. */
export function isCapturing(): boolean {
  return active;
}

/** Clear the buffer. */
export function clear(): void {
  buffer.length = 0;
}

/** Capture a message directly (not from console). */
export function capture(message: string): void {
  buffer.push(`[${getTimestamp()}] ${message}`);
}

/**
 * Capture an error with stack trace.
 */
export function captureError(label: string, error: unknown): void {
  const msg = error instanceof Error ? `${error.message}\n${error.stack || ''}` : String(error);
  capture(`ERROR [${label}]: ${msg}`);
}

/**
 * Download the log content as a .log file.
 */
export function saveLogToFile(filename?: string): void {
  const content = buffer.join('\n');
  if (!content) return;
  const name = filename || `ladder-load-${Date.now()}.log`;
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Remove any existing error overlay from the DOM.
 */
function removeOverlay(): void {
  const existing = document.getElementById('load-error-overlay');
  if (existing) existing.remove();
}

/**
 * Show a modal error dialog with log preview and Save Log button.
 */
export function showErrorWithLog(message: string): void {
  removeOverlay();

  const logContent = buffer.join('\n');
  const previewLines = logContent ? logContent.split('\n').slice(-40) : ['(empty log)'];
  const preview = previewLines.join('\n');

  // Overlay backdrop
  const overlay = document.createElement('div');
  overlay.id = 'load-error-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5); z-index: 99999;
    display: flex; align-items: center; justify-content: center;
  `;

  // Dialog box
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: #fff; border-radius: 8px; padding: 24px; max-width: 640px; width: 90%;
    max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  `;

  // Title
  const title = document.createElement('div');
  title.style.cssText = 'font-size: 18px; font-weight: 600; color: #dc2626; margin-bottom: 12px;';
  title.textContent = '⚠ Load Error';

  // Message
  const msg = document.createElement('div');
  msg.style.cssText = 'font-size: 14px; color: #374151; margin-bottom: 12px; line-height: 1.5;';
  msg.textContent = message;

  // Log preview
  const label = document.createElement('div');
  label.style.cssText = 'font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 4px; text-transform: uppercase;';
  label.textContent = 'Loading Log (last 40 lines)';

  const pre = document.createElement('pre');
  pre.style.cssText = `
    background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 4px; padding: 12px;
    font-size: 11px; color: #374151; white-space: pre-wrap; word-break: break-all;
    max-height: 240px; overflow-y: auto; margin-bottom: 16px; font-family: monospace;
  `;
  pre.textContent = preview;

  // Buttons row
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

  const saveBtn = document.createElement('button');
  saveBtn.style.cssText = `
    padding: 8px 16px; border-radius: 4px; border: 1px solid #d1d5db; background: #f9fafb;
    font-size: 14px; cursor: pointer; color: #374151;
  `;
  saveBtn.textContent = '💾 Save Log';
  saveBtn.onclick = () => {
    saveLogToFile();
    removeOverlay();
  };

  const dismissBtn = document.createElement('button');
  dismissBtn.style.cssText = `
    padding: 8px 16px; border-radius: 4px; border: none; background: #dc2626;
    font-size: 14px; cursor: pointer; color: #fff;
  `;
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.onclick = () => removeOverlay();

  btnRow.appendChild(saveBtn);
  btnRow.appendChild(dismissBtn);
  dialog.appendChild(title);
  dialog.appendChild(msg);
  dialog.appendChild(label);
  dialog.appendChild(pre);
  dialog.appendChild(btnRow);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Close on Escape
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      removeOverlay();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);

  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      removeOverlay();
      document.removeEventListener('keydown', onKey);
    }
  });
}
