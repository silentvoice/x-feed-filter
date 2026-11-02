const log = document.getElementById('log') as HTMLPreElement;
const state = window as unknown as { __results?: unknown };

for (const button of document.querySelectorAll<HTMLButtonElement>('button')) {
  button.addEventListener('click', () => {
    log.textContent = '';
    state.__results = undefined;
    // A worker keeps the page responsive, as the extension's model host does.
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ line?: string; results?: unknown }>) => {
      if (event.data.line !== undefined) log.textContent += `${event.data.line}\n`;
      if (event.data.results) {
        state.__results = event.data.results;
        log.textContent += '\nDone.\n';
        worker.terminate();
      }
    };
    worker.postMessage({ dtype: button.dataset.dtype, device: button.dataset.device });
  });
}
