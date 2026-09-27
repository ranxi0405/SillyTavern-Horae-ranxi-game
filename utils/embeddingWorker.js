/**
 * Horae - Embedding Web Worker
 * 使用 Transformers.js 在后台线程进行文本向量化
 */

let pipeline = null;
let extractor = null;
let dimensions = 0;

self.onmessage = async (e) => {
    const { type, id, data } = e.data;

    try {
        switch (type) {
            case 'init': {
                const module = await import('./lib/transformers.min.js');
                pipeline = module.pipeline;

                // 本地模型配置：只读本地文件，不访问 huggingface
                const libBase = new URL('./lib/', import.meta.url).href;
                module.env.allowLocalModels = true;
                module.env.allowRemoteModels = false;
                module.env.localModelPath = libBase + 'models/';
                if (module.env.backends?.onnx?.wasm) {
                    module.env.backends.onnx.wasm.numThreads = 1;
                }

                extractor = await pipeline('feature-extraction', data.model, {
                    dtype: data.dtype || 'q8',
                    device: 'wasm',
                    progress_callback: (info) => {
                        self.postMessage({ type: 'progress', data: info });
                    },
                });

                const probe = await extractor('test', { pooling: 'cls', normalize: true });
                dimensions = probe.dims[probe.dims.length - 1];
                self.postMessage({ type: 'ready', dimensions });
                break;
            }

            case 'embed': {
                if (!extractor) {
                    self.postMessage({ type: 'error', id, message: '模型未初始化' });
                    return;
                }
                const texts = data.texts;
                const output = await extractor(texts, { pooling: 'cls', normalize: true });
                const vectors = [];
                for (let i = 0; i < texts.length; i++) {
                    vectors.push(Array.from(output.data.slice(i * dimensions, (i + 1) * dimensions)));
                }
                self.postMessage({ type: 'result', id, vectors });
                break;
            }

            case 'dispose': {
                if (extractor) {
                    try { await extractor.dispose(); } catch (_) { /* ignore */ }
                    extractor = null;
                    pipeline = null;
                }
                self.postMessage({ type: 'disposed' });
                break;
            }
        }
    } catch (err) {
        self.postMessage({ type: 'error', id, message: err?.message || String(err) });
    }
};
