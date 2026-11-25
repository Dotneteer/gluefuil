var examples = [
  {
    title: 'A working example (edit it!)',
    markup: '<VStack var.count="{0}">\n  <Button label="{\'Clicked \' + count + \' times\'}" onClick="count++"/>\n  <Text variant="strong">count is {count}</Text>\n</VStack>'
  },
  {
    title: 'Sandbox: platform globals are compile errors (C002)',
    markup: '<Text>{window.location.href} {document.title}</Text>'
  },
  {
    title: 'Scoping: unknown names (C001) and read-only names (C012)',
    markup: '<Stack var.n="{1}">\n  <Text>{nn}</Text>\n  <Button onClick="Math = 1"/>\n</Stack>'
  },
  {
    title: 'Contracts: unknown prop, enum, type (E020, E023, E022)',
    markup: '<Stack orientation="diagonal">\n  <Text valu="x"/>\n  <Text maxLines="two">…</Text>\n</Stack>'
  },
  {
    title: 'Contracts: unknown event and API member (E004, C015)',
    markup: '<Stack>\n  <TextBox id="box" onDidChang="x => x"/>\n  <Text>{box.valeu}</Text>\n</Stack>'
  },
  {
    title: 'Markup errors (M…) and an unknown component (E001)',
    markup: '<Stack>\n  <Buton label="x"/>\n  <Text>unclosed\n</Stack>'
  }
];
