/* ── Colony modals: Promise-based replacements for native prompt/alert ──
   Classic script — loaded after js/utils.js (uses escapeHtml), before app.js.
   Built on <dialog> for focus-trapping + Esc handling, but resolution is
   driven by explicit button handlers and the `cancel` event rather than the
   `close` event — the `close` event proved unreliable for programmatic submits
   in some Chrome builds. The page's JS thread never blocks (unlike native
   prompt/alert, which freeze rendering and are invisible to automation).

   API (all return Promises):
     colonyAlert(message, { title })                        → void
     colonyConfirm(message, { title, confirmLabel,
                  cancelLabel, danger })                     → boolean
     colonyPrompt(message, { title, type, placeholder,
                             okLabel })                      → string | null
     colonyChoice(message, { title, choices: [{ label,
                  value, variant }], cancelLabel })          → value | null
   Cancel / Esc / backdrop-click resolve to null (false for confirm,
   undefined for alert). */

function _colonyModalOpen({ title, message, buildBody, resolveCancel }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'colony-modal';
    const messageHtml = message ? escapeHtml(message).replaceAll('\n', '<br>') : '';
    dialog.innerHTML = `
      <div class="colony-modal-form">
        ${title ? `<h3 class="colony-modal-title">${escapeHtml(title)}</h3>` : ''}
        ${message ? `<p class="colony-modal-message">${messageHtml}</p>` : ''}
        <div class="colony-modal-body"></div>
        <div class="colony-modal-actions"></div>
      </div>`;
    document.body.appendChild(dialog);

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(value);
    };

    const body = dialog.querySelector('.colony-modal-body');
    const actions = dialog.querySelector('.colony-modal-actions');
    buildBody({ dialog, body, actions, finish });

    // Esc key fires the dialog `cancel` event (reliable cross-browser).
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); finish(resolveCancel()); });
    // Backdrop click = cancel.
    dialog.addEventListener('mousedown', (e) => { if (e.target === dialog) finish(resolveCancel()); });

    dialog.showModal();
  });
}

function colonyAlert(message, { title = '' } = {}) {
  return _colonyModalOpen({
    title, message,
    resolveCancel: () => undefined,
    buildBody: ({ actions, finish }) => {
      actions.innerHTML = '<button type="button" class="primary">OK</button>';
      actions.querySelector('button').addEventListener('click', () => finish(undefined));
    }
  });
}

function colonyConfirm(message, { title = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return _colonyModalOpen({
    title, message,
    resolveCancel: () => false,
    buildBody: ({ actions, finish }) => {
      actions.innerHTML = `
        <button type="button" class="ghost" data-cancel></button>
        <button type="button" class="${danger ? 'danger' : 'primary'}" data-ok></button>`;
      const okBtn = actions.querySelector('[data-ok]');
      const cancelBtn = actions.querySelector('[data-cancel]');
      okBtn.textContent = confirmLabel;
      cancelBtn.textContent = cancelLabel;
      okBtn.addEventListener('click', () => finish(true));
      cancelBtn.addEventListener('click', () => finish(false));
    }
  });
}

function colonyPrompt(message, { title = '', type = 'text', placeholder = '', okLabel = 'OK' } = {}) {
  return _colonyModalOpen({
    title, message,
    resolveCancel: () => null,
    buildBody: ({ body, actions, finish }) => {
      body.innerHTML = `<input class="colony-modal-input"
        type="${type === 'password' ? 'password' : 'text'}"
        placeholder="${escapeHtml(placeholder)}" autocomplete="off">`;
      actions.innerHTML = `
        <button type="button" class="ghost" data-cancel>Cancel</button>
        <button type="button" class="primary" data-ok>${escapeHtml(okLabel)}</button>`;
      const input = body.querySelector('input');
      const submit = () => finish(input.value);
      actions.querySelector('[data-ok]').addEventListener('click', submit);
      actions.querySelector('[data-cancel]').addEventListener('click', () => finish(null));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
      setTimeout(() => input.focus(), 0);
    }
  });
}

function colonyChoice(message, { title = '', choices = [], cancelLabel = 'Cancel' } = {}) {
  return _colonyModalOpen({
    title, message,
    resolveCancel: () => null,
    buildBody: ({ body, actions, finish }) => {
      body.innerHTML = '<div class="colony-modal-choices"></div>';
      const list = body.querySelector('.colony-modal-choices');
      choices.forEach((c) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = (c.variant === 'primary' ? 'primary' : 'ghost') + ' colony-modal-choice';
        btn.textContent = c.label;
        btn.addEventListener('click', () => finish(c.value)); // closure keeps the real value (any type)
        list.appendChild(btn);
      });
      actions.innerHTML = `<button type="button" class="ghost" data-cancel></button>`;
      const cancelBtn = actions.querySelector('[data-cancel]');
      cancelBtn.textContent = cancelLabel;
      cancelBtn.addEventListener('click', () => finish(null));
    }
  });
}
