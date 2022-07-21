import { WebR } from 'https://webr.gwstagg.co.uk/webr.mjs';
import { Spinner } from 'https://cdnjs.cloudflare.com/ajax/libs/spin.js/4.1.0/spin.min.js';

const loadScript = (url) => new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = url;
  script.onload = () => resolve();
  script.onerror = reject;
  document.head.appendChild(script);
});

const loadCSS = (url) => new Promise((resolve, reject) => {
  const link = document.createElement('link');
  link.type = 'text/css';
  link.rel = 'stylesheet';
  link.href = url;
  link.onload = () => resolve();
  link.onerror = reject;
  document.head.appendChild(link);
});

class Runner {
  webR;
  buffers;
  queue;
  envID;
  prompt;

  constructor() {
    console.log('Runner: Initialising webR...')
    this.envID = 0;
    this.webR = new WebR({
      RArgs: ['--quiet'],
      REnv: {
        R_HOME: '/usr/lib/R',
        R_ENABLE_JIT: '0',
        R_DEFAULT_DEVICE: 'canvas'
      },
    });
    this.queue = Promise.all([this.webR.init(), this.#waitForPrompt()]).then(() => {
      this.#clearBuffers();
      console.log('Runner: webR initialised');
      $('span.webr-loading').remove();
      $('button.webr-run').removeAttr("disabled");
    });
  }

  #clearBuffers() {
    this.buffers = {
      stdout: [],
      stderr: [],
      canvas: undefined,
    };
  }

  async #waitForPrompt() {
    let prompt = false;
    while (!prompt) {
      const output = await this.webR.read();
      switch (output.type) {
        case 'stdout':
          this.buffers.stdout.push(output.data);
          break;
        case 'stderr':
          this.buffers.stderr.push(output.data);
          break;
        case 'canvasExec':
          if (!this.buffers.canvas) {
            this.buffers.canvas = document.createElement("canvas");
            this.buffers.canvas.setAttribute('width', '1008');
            this.buffers.canvas.setAttribute('height', '1008');
          }
          Function(`this.buffers.canvas.getContext('2d').${output.data}`).bind(this)();
          break;
        case 'prompt':
          prompt = true;
          break;
      }
    }
  }

  async #enqueue(fn) {
    this.queue = this.queue.then(() => {
        const qr = fn();
        return qr;
    });
    const r = await this.queue;
    return r;
  }

  newEnv() {
    let env = this.envID++;
    this.#enqueue(async () => {
      await this.webR.evalRCode(`webr_env${env} <- new.env()`);
    });
    return env;
  }

  runCode(code, env) {
    if (typeof env === 'undefined') {
      env = this.newEnv();
    }
    return this.#enqueue(async () => {
      this.#clearBuffers();
      try {
        this.webR.writeConsole(`with(webr_env${env}, {\n${code}\n});`);
        await this.#waitForPrompt();
        return this.buffers;
      } catch (e) {
        return this.buffers;
      }
    });
  }
}

const runner = new Runner();
await Promise.all([
  loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/codemirror.min.js'),
  loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/r/r.min.js'),
  loadCSS('https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/codemirror.min.css'),
  loadCSS('https://cdnjs.cloudflare.com/ajax/libs/spin.js/4.1.0/spin.css'),
]);

let editors = [];
let envID = runner.newEnv();

$('pre.r').each(function(idx) {
    $(this).before(`
    <button disabled="disabled" class="webr-run">Run R Code</button>
    <span class="webr-loading">
      <span>Loading webR...</span>
      <div style='display: inline-block'><div class='webr-spinner'></div></div>
    </span>
    `);
    let code = $(this).find("code").first()
    let editor = CodeMirror((elt) => {
        $(elt).css('border', '1px solid #eee');
        $(elt).css('height', 'auto');
        $(elt).data('webr-id', idx)
        $(this).replaceWith(elt);
    }, {
        value: $(this).find("code").text(),
        lineNumbers: true,
        mode: 'r',
        theme: 'light default',
        viewportMargin: Infinity,
    });
    editors[idx] = editor;
});

$('div.webr-spinner').each(function() {
  new Spinner({
    color:'#000',
    lines: 12,
    scale: 0.5,
    top: '-10px',
    left: '10px',
    position: 'relative',
  }).spin(this);
});

$('button.webr-run').click(function(e){
    $(this).attr("disabled","disabled");
    let id = $(this).next().data('webr-id');
    let code = editors[id].getValue();
    runner.runCode(code, envID).then( (result) => {
        $(this).removeAttr("disabled");
        let oldOutput = $(this).next().next();
        if (!result.canvas || result.stderr.length > 0) {
          if (oldOutput.prop("tagName") === 'PRE') {
            oldOutput.text(`${([...result.stdout,...result.stderr]).join('\n')}`);
          } else {
            oldOutput.after(`<pre>${([...result.stdout,...result.stderr]).join('\n')}</pre>`);
            oldOutput.remove();
          }
        } else {
          oldOutput.after(result.canvas).next().css('width', '75%');
          oldOutput.remove();
        }
      }
    );
});
