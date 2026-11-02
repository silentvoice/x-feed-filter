import { useEffect, useState } from 'react';
import {
  MODEL_NAMES,
  ModelStatusLine,
  startModel,
  useModelStatus,
} from '@/components/model-status';
import { useSettings } from '@/components/use-settings';
import type { BackendId } from '@/lib/classifier/backend';
import { DOWNLOAD_MB, IMAGE_TEXT_MB } from '@/lib/model-status';

/** The model that "Automatic" selects on this computer. */
function useAutoBackend(): BackendId | null {
  const [backend, setBackend] = useState<BackendId | null>(null);
  useEffect(() => {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    (gpu ? gpu.requestAdapter().catch(() => null) : Promise.resolve(null)).then((adapter) =>
      setBackend(adapter ? 'd1' : 'zero-shot'),
    );
  }, []);
  return backend;
}

const LINK = 'font-medium text-brand-600 underline dark:text-brand-400';

export function App() {
  const [settings] = useSettings();
  const status = useModelStatus();
  const autoBackend = useAutoBackend();
  const [started, setStarted] = useState(false);
  if (!settings) return null;

  const backend = settings.backend === 'auto' ? autoBackend : settings.backend;
  const modelMb = backend ? DOWNLOAD_MB[backend] : 0;
  const totalMb = modelMb + (settings.analyzeImages ? IMAGE_TEXT_MB : 0);
  const active = started || status.state !== 'idle';

  return (
    <main className="mx-auto max-w-2xl px-6 py-10 text-base text-neutral-900 dark:text-neutral-100">
      <header className="flex items-center gap-4">
        <img src="/icon.svg" alt="" className="size-14" />
        <div>
          <h1 className="font-bold text-3xl">Welcome to Lull</h1>
          <p className="text-neutral-500">A calmer feed for X.</p>
        </div>
      </header>

      <section className="mt-8">
        <h2 className="font-semibold text-lg">How it works</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Turn on the filters that you want, or describe your own in plain language.</li>
          <li>A small AI model on your computer checks each post on x.com.</li>
          <li>Lull blurs the posts that match. Click Show to see a post.</li>
        </ol>
      </section>

      <section className="mt-8 rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="font-semibold text-lg">Download the model</h2>
        {backend === 'rules-only' ? (
          <p className="mt-2">You use rules only. Lull does not download a model.</p>
        ) : (
          <>
            <p className="mt-2">
              Lull downloads the model one time and keeps it on your computer.
              {backend && (
                <>
                  {' '}
                  On this computer, it uses <strong>{MODEL_NAMES[backend]}</strong>
                  {backend === 'd1' ? ' on your graphics processor (WebGPU)' : ' on the processor'}.
                  The download is about <strong>{totalMb} MB</strong>
                  {settings.analyzeImages &&
                    `, including ${IMAGE_TEXT_MB} MB for the text in images`}
                  .
                </>
              )}
            </p>
            <p className="mt-2 text-neutral-500 text-sm">
              Until the download is complete, posts stay visible. A Wi-Fi connection is recommended.
            </p>
            <div className="mt-4">
              {active ? (
                <ModelStatusLine autoStart={false} />
              ) : (
                <button
                  type="button"
                  className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-500"
                  onClick={() => {
                    setStarted(true);
                    startModel();
                  }}
                >
                  Download and start
                </button>
              )}
            </div>
          </>
        )}
        {status.state === 'ready' && (
          <a
            href="https://x.com/home"
            className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-500"
          >
            Open x.com
          </a>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-semibold text-lg">Your privacy</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Posts do not leave your computer. The model runs on your device.</li>
          <li>Lull has no server, no account, and no analytics.</li>
          <li>
            Lull connects only to Hugging Face (to download the models) and to the X image server
            (to read the text in images).
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold text-lg">Tip</h2>
        <p className="mt-2">
          Pin Lull to the Chrome toolbar: click the puzzle icon, then the pin next to Lull. The
          popup shows what Lull filtered today.
        </p>
      </section>

      <section className="mt-8 text-neutral-500 text-sm">
        <h2 className="font-semibold text-base text-neutral-900 dark:text-neutral-100">
          Model licenses
        </h2>
        <p className="mt-2">
          The models have their own licenses. They apply when you download them:
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>
            Liquid AI d1-omni-600M:{' '}
            <a className={LINK} href="https://huggingface.co/LiquidAI/d1-omni-600M">
              LFM Open License v1.0
            </a>
            .
          </li>
          <li>
            ModernBERT zero-shot:{' '}
            <a
              className={LINK}
              href="https://huggingface.co/MoritzLaurer/ModernBERT-base-zeroshot-v2.0"
            >
              Apache-2.0
            </a>
            .
          </li>
          <li>
            Indra OCR by Datalab:{' '}
            <a
              className={LINK}
              href="https://huggingface.co/datalab-to/indra-ocr/blob/v1.1.0/LICENSE"
            >
              modified OpenRAIL-M
            </a>
            . Its use restrictions (Attachment A) apply to you: use it only for lawful purposes.
            Organizations with more than USD 20 million in revenue or funding can use it only for
            personal use or research. You can turn off images in the settings.
          </li>
        </ul>
        <p className="mt-4">
          <a className={LINK} href="/options.html">
            Open the settings
          </a>{' '}
          · Lull is not affiliated with X Corp.
        </p>
      </section>
    </main>
  );
}
