# Local translation components

The extension's own code is MIT licensed. The following components are downloaded on demand and retain their respective licenses; their model weights and runtime binaries are not committed to this repository.

- [Transformers.js](https://github.com/huggingface/transformers.js), Hugging Face, version 3.8.1 — Apache-2.0. The browser runtime is loaded from jsDelivr with a fixed version and SHA-256 verification.
- [ONNX Runtime](https://github.com/microsoft/onnxruntime), Microsoft — MIT. The WASM runtime distributed with Transformers.js 3.8.1 is version-pinned and SHA-256 verified before execution.
- [OPUS-MT English → Russian](https://huggingface.co/Helsinki-NLP/opus-mt-en-ru), Helsinki-NLP — Apache-2.0. The compatible [Xenova ONNX conversion](https://huggingface.co/Xenova/opus-mt-en-ru) is pinned to revision `e050376e960175e8ddc5cff85025dc8436cddd68`.

See each upstream project's license and model card for details. Downloads are cached on the user's device. No lyric text is sent to these download hosts.
