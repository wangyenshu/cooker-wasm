# cooker in the browser

Run TiddlyWiki's [cooker](https://github.com/TiddlyWiki/cooker) `ginsu.rb` in a web page to split a
TiddlyWiki Classic file into separate tiddler files. Everything runs in the browser tab.

cooker needs Ruby 1.8, so the page runs Ruby 1.8.7 compiled to WebAssembly.

## Usage

Serve this folder over HTTP:

```sh
python3 -m http.server
```

Open <http://localhost:8000> and choose a TiddlyWiki file. Set any options, then click
**Run ginsu.rb**. When the run finishes, click **Download** in the Output section to save
`<file>.0.tar.gz`.

## Files

| File | Purpose |
|---|---|
| `index.html` | The page |
| `cooker-worker.js` | Runs Ruby in a Web Worker, with a fresh instance for each run |
| `ruby.js`, `ruby.wasm` | Ruby 1.8.7 for WebAssembly, with the standard library embedded |
| `cooker/` | cooker's source, unmodified |

## Acknowledgements

- [TiddlyWiki cooker](https://github.com/TiddlyWiki/cooker).
- [emscripten-forge](https://github.com/emscripten-forge/recipes).
- [Ruby](https://www.ruby-lang.org/).
