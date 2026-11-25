// Every built-in icon name (packages/components/src/icon-names.ts: XMLUI's names and the App shell's).
var iconNames = [
  'assign', 'arrowup', 'arrowleft', 'arrowright', 'arrowdown', 'pause', 'play', 'date',
  'hamburger', 'send', 'users', 'refresh', 'sidebar-collapse', 'chevrondown', 'chevronup',
  'chevronright', 'chevronleft', 'chevronsright', 'chevronsleft', 'doublechevrondown',
  'doublechevronup', 'doublechevronright', 'doublechevronleft', 'dotmenu', 'dotmenuhorizontal',
  'noresult', 'crm', 'chat', 'pencil', 'cube', 'apps', 'permissions', 'close', 'star', 'help',
  'compactlist', 'copy', 'move', 'rename', 'hyperlink', 'globe', 'link', 'looselist', 'options',
  'search', 'filter', 'trash', 'pen', 'email', 'phone', 'home', 'user', 'exit', 'adduser',
  'userminus', 'plus', 'inspect', 'plus-circle', 'filledplus', 'darktolight', 'lighttodark',
  'checkmark', 'valid', 'info', 'error', 'warning', 'board', 'list', 'folder', 'folder-outline',
  'emptyfolder', 'pdf', 'txt', 'doc', 'docx', 'doc-outline', 'conf', 'code', 'codesandbox', 'box',
  'unknownfile', 'photo', 'previous', 'next', 'like', 'reply', 'attach', 'attach2', 'emoji',
  'message', 'upload', 'split-vertical', 'split-horizontal', 'swap', 'download', 'note', 'binding',
  'database', 'unlink', 'api', 'expression', 'hash', 'drive', 'lock', 'start', 'stop', 'restart',
  'duplicate', 'connect', 'cog', 'sun', 'moon', 'stars', 'share', 'new-window', 'paint', 'palette',
  'trending-up', 'trending-down', 'trending-level', 'sortasc', 'sortdesc', 'nosort', 'square',
  'squarehalf', 'squarefill', 'table-insert-row', 'table-delete-row', 'table-insert-column',
  'table-delete-column', 'eye', 'eye-off', 'settings', 'chart', 'mail', 'layout', 'chevronRight',
  'chevronLeft', 'chevronDown'
];

function matching(query) {
  const q = query.trim().toLowerCase();
  return q === '' ? iconNames : iconNames.filter((name) => name.toLowerCase().includes(q));
}
