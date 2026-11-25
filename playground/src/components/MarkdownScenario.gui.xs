// The Markdown scenario's samples: text a page would get at runtime (content="{…}").
// Runtime strings are rendered, never evaluated: @{…} in them stays as written.
var samples = {
  basics: [
    '## Basics',
    '',
    'Paragraphs, **bold**, *italic*, ~~deleted~~ and `inline code`.',
    '',
    '1. An ordered',
    '2. list',
    '',
    '- An unordered',
    '- list',
    '',
    '> A quotation.',
    '',
    '---',
    '',
    '```js',
    'const answer = 42;',
    '```'
  ].join('\n'),
  gfm: [
    '## GitHub Flavored Markdown',
    '',
    '| Feature | Status |',
    '|:--------|-------:|',
    '| Tables | done |',
    '| Task lists | done |',
    '',
    '- [x] A finished task',
    '- [ ] An open task',
    '',
    'An autolink: https://github.com, and a footnote.[^1]',
    '',
    '[^1]: Footnotes are listed at the end.'
  ].join('\n'),
  links: [
    '## Links and images',
    '',
    '- [A route](/icons) goes through the router.',
    '- [A URL](https://github.com) is followed by the browser.',
    '- [A reference link][cards]',
    '',
    '![The sample landscape](/sample-landscape.svg "A picture")',
    '',
    '[cards]: /cards'
  ].join('\n'),
  unsafe: [
    '## Untrusted input',
    '',
    'Raw HTML passes an allowlist: <b>bold</b> and <details><summary>details</summary> work.</details>',
    '',
    'A <script>alert("x")</script> tag, an <img src="javascript:alert(1)" onerror="alert(1)"> image',
    'and a [javascript: link](javascript:alert(1)) are made harmless.',
    '',
    'A runtime string is never evaluated: @{secret} stays as written.'
  ].join('\n')
};
