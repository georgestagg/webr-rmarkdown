import { WebR } from 'https://webr.gwstagg.co.uk/latest/webr.mjs';

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

loadCSS('https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/codemirror.min.css')
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/codemirror.min.js')
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/r/r.js')

const webR = new WebR({
  REnv: {
    R_HOME: '/usr/lib/R',
    R_ENABLE_JIT: '0',
    R_DEFAULT_DEVICE: 'canvas',
    COLORTERM: 'truecolor',
  }
});
let editors = [];
let env = (await webR.evalRCode('new.env()')).result;

$('pre.r').each(function(idx) {
  $(this).before('<button class="run-code">Run R Code</button>');
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

$('button.run-code').click(function(e){
  $(this).attr("disabled","disabled");
  let id = $(this).next().data('webr-id');
  let code = editors[id].getValue();
  webR.init().then( async () => {
    let oldOutput = $(this).next().next();
    let canvas = undefined;
    try {
      const result = await webR.evalRCode(
        code,
        env,
        { withAutoprint: true, captureStreams: true, captureConditions: false }
      );
      const msgs = await webR.flush();
      msgs.forEach(msg => {
        if (msg.type === 'canvasExec'){
          if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.setAttribute('width', '1008');
            canvas.setAttribute('height', '1008');
          }
          Function(`this.getContext('2d').${msg.data}`).bind(canvas)();
        }
      });
      if (!canvas) {
        const out = result.output.filter(
          evt => evt.type == 'stdout' || evt.type == 'stderr'
        ).map((evt) => evt.data);
        oldOutput.after(`<pre>${out.join('\n')}</pre>`);
        oldOutput.remove();
      } else {
        oldOutput.after(canvas).next().css('width', '50%');
        oldOutput.remove();
      }
    } catch (e) {
      oldOutput.after(`<pre>`+e.toString()+`</pre>`);
      oldOutput.remove();
    } finally {
      $(this).removeAttr("disabled");
    }
  });
});
