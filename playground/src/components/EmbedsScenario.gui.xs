// The framed document: it says hello when it loads and echoes every message back.
var frameDocument = "<!doctype html><body style='font: 14px system-ui'><p>A framed document (sandboxed, scripts only).</p><p id='last'></p><script>" +
  "parent.postMessage('ready', '*');" +
  "addEventListener('message', function (e) { document.getElementById('last').textContent = 'Got: ' + e.data; parent.postMessage({ echo: 'echo ' + e.data }, '*'); });" +
  "</script></body>";
