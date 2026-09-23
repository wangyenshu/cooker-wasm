/* Runs TiddlyWiki cooker on Ruby 1.8.7 compiled to WebAssembly.
 *
 * Each run gets a fresh Ruby instance (Ruby 1.8 cannot be re-initialised);
 * the compiled WebAssembly.Module is reused.  The user's files are copied
 * into /out, where ginsu writes its split directory next to the wiki.
 * Results are whatever the run leaves under /out.
 *
 * in:  {type:'run', argv, cwd, files:[{path, file:File}]}
 * out: {type:'ready'} | {type:'out', text} |
 *      {type:'done', status, files:[{path, data, mtime}]} | {type:'fail', error}
 */
'use strict';
importScripts('ruby.js');

const COOKER = ['ginsu.rb', 'splitter.rb', 'tiddler.rb'];
// Where ruby.wasm embeds its standard library (both the web build and the
// emscripten-forge build put a copy there).
const RUBYLIB = '/usr/local/lib/ruby/1.8:/usr/local/lib/ruby/1.8/wasm32-emscripten';
let wasmModule, cookerSources;

const ready = (async () => {
  const get = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
    return r;
  };
  [wasmModule, cookerSources] = await Promise.all([
    get('ruby.wasm').then((r) => r.arrayBuffer()).then((b) => WebAssembly.compile(b)),
    Promise.all(COOKER.map(async (n) => [n, new Uint8Array(await (await get('cooker/' + n)).arrayBuffer())])),
  ]);
})();

function collect(FS, dir, prefix, out) {
  for (const name of FS.readdir(dir)) {
    if (name === '.' || name === '..') continue;
    const p = dir + '/' + name;
    const st = FS.stat(p);
    const rel = prefix + name;
    const mtime = st.mtime instanceof Date ? st.mtime.getTime() : Number(st.mtime);
    if (FS.isDir(st.mode)) {
      out.push({ path: rel + '/', dir: true, mtime });
      collect(FS, p, rel + '/', out);
    } else {
      out.push({ path: rel, data: FS.readFile(p), mtime });
    }
  }
  return out;
}

async function run({ argv, cwd, files }) {
  const M = await createRuby({
    noInitialRun: true,
    thisProgram: 'ruby',
    print: (text) => postMessage({ type: 'out', text }),
    printErr: (text) => postMessage({ type: 'out', text }),
    stdin: () => null,
    instantiateWasm(imports, done) {
      WebAssembly.instantiate(wasmModule, imports).then((inst) => done(inst, wasmModule));
      return {};
    },
    preRun: [(m) => Object.assign(m.ENV, { HOME: '/out', PATH: '/bin', USER: 'ginsu', RUBYLIB })],
  });
  const FS = M.FS;
  FS.mkdir('/cooker');
  for (const [n, data] of cookerSources) FS.writeFile('/cooker/' + n, data);
  FS.mkdir('/out');
  const reader = new FileReaderSync();
  for (const f of files) {
    FS.writeFile('/out/' + f.path, new Uint8Array(reader.readAsArrayBuffer(f.file)));
    FS.utime('/out/' + f.path, f.file.lastModified, f.file.lastModified);
  }
  FS.chdir(cwd);

  let status;
  try {
    status = M.callMain(argv);
  } catch (e) {
    if (e && e.name === 'ExitStatus') status = e.status;
    else if (typeof WebAssembly.Exception === 'function' && e instanceof WebAssembly.Exception) {
      throw new Error('a longjmp found no target (Ruby thread switches and Continuation#call are not supported)');
    } else throw e;
  }
  const out = collect(FS, '/out', '', []);
  postMessage({ type: 'done', status, files: out }, out.filter((f) => f.data).map((f) => f.data.buffer));
}

ready.then(() => postMessage({ type: 'ready' }), (e) => postMessage({ type: 'fail', error: String(e.message || e) }));
let queue = ready;
onmessage = (ev) => {
  queue = queue.then(() => run(ev.data)).catch((e) => postMessage({ type: 'fail', error: String((e && e.message) || e) }));
};