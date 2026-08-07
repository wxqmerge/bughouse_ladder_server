/**
 * Replace native window.confirm() with a styled modal dialog.
 * Returns a Promise<boolean> (true = OK, false = Cancel).
 */

function removeOverlay(): void {
  const existing = document.getElementById('confirm-dialog-overlay');
  if (existing) existing.remove();
}

export function showConfirmDialog(message: string): Promise<boolean> {
  removeOverlay();
  return new Promise<boolean>((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'confirm-dialog-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5); z-index: 99999;
      display: flex; align-items: center; justify-content: center;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: #fff; border-radius: 8px; padding: 24px; max-width: 480px; width: 90%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    `;

    const icon = document.createElement('div');
    icon.style.cssText = 'font-size: 24px; margin-bottom: 12px;';
    icon.textContent = '⚠️';

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size: 14px; color: #374151; line-height: 1.6; margin-bottom: 20px; white-space: pre-wrap;';
    msg.textContent = message;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

    const cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = `
      padding: 8px 16px; border-radius: 4px; border: 1px solid #d1d5db; background: #f9fafb;
      font-size: 14px; cursor: pointer; color: #374151;
    `;
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => { removeOverlay(); document.removeEventListener('keydown', onKey); resolve(false); };

    const okBtn = document.createElement('button');
    okBtn.style.cssText = `
      padding: 8px 16px; border-radius: 4px; border: none; background: #dc2626;
      font-size: 14px; cursor: pointer; color: #fff;
    `;
    okBtn.textContent = 'Continue';
    okBtn.onclick = () => { removeOverlay(); document.removeEventListener('keydown', onKey); resolve(true); };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);
    dialog.appendChild(icon);
    dialog.appendChild(msg);
    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        removeOverlay();
        document.removeEventListener('keydown', onKey);
        resolve(false);
      }
    };
    document.addEventListener('keydown', onKey);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        removeOverlay();
        document.removeEventListener('keydown', onKey);
        resolve(false);
      }
    });

    // Focus OK button
    okBtn.focus();
  });
}

/**
 * Replace native window.alert() with a styled modal dialog.
 */
export function showAlertDialog(message: string): void {
  const existing = document.getElementById('alert-dialog-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'alert-dialog-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5); z-index: 99999;
    display: flex; align-items: center; justify-content: center;
  `;

  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: #fff; border-radius: 8px; padding: 24px; max-width: 480px; width: 90%;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  `;

  const icon = document.createElement('div');
  icon.style.cssText = 'font-size: 24px; margin-bottom: 12px;';
  icon.textContent = 'ℹ️';

  const msg = document.createElement('div');
  msg.style.cssText = 'font-size: 14px; color: #374151; line-height: 1.6; margin-bottom: 20px; white-space: pre-wrap;';
  msg.textContent = message;

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display: flex; justify-content: flex-end;';

  const okBtn = document.createElement('button');
  okBtn.style.cssText = `
    padding: 8px 16px; border-radius: 4px; border: none; background: #2563eb;
    font-size: 14px; cursor: pointer; color: #fff;
  `;
  okBtn.textContent = 'OK';
  okBtn.onclick = () => overlay.remove();

  btnRow.appendChild(okBtn);
  dialog.appendChild(icon);
  dialog.appendChild(msg);
  dialog.appendChild(btnRow);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  okBtn.focus();
}
