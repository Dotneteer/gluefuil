// Script nodes carry file offsets. With `offset`/`offsets`, positions point
// into the .gui file, not into the attribute value or text.
import { describe, expect, test } from "vitest";
import type * as AST from "../../src/script/ast";
import { parseExpression, parseStatements } from "../../src/script/parse";

const slice = (text: string, node: { start: number; end: number }) => text.slice(node.start, node.end);

describe("node spans", () => {
  const source = "user.name + items.map(x => x * 2)[0]";
  const expression = parseExpression(source).expression as AST.BinaryExpression;

  test("binary expression covers both operands", () => {
    expect(slice(source, expression)).toBe(source);
  });

  test("member, call, arrow and computed member spans", () => {
    expect(slice(source, expression.left)).toBe("user.name");
    const right = expression.right as AST.MemberExpression;
    expect(slice(source, right)).toBe("items.map(x => x * 2)[0]");
    const call = right.object as AST.CallExpression;
    expect(slice(source, call)).toBe("items.map(x => x * 2)");
    expect(slice(source, call.arguments[0]!)).toBe("x => x * 2");
    expect(slice(source, (call.arguments[0] as AST.ArrowFunctionExpression).body)).toBe("x * 2");
  });

  test("parenthesized expression spans exclude the parentheses", () => {
    const text = "(a + b) * c";
    const product = parseExpression(text).expression as AST.BinaryExpression;
    expect(slice(text, product)).toBe("(a + b) * c");
    expect(slice(text, product.left)).toBe("a + b");
  });

  test("statement spans", () => {
    const text = "let x = 1;\nif (x) {\n  go();\n}";
    const { program } = parseStatements(text);
    expect(program.body.map((s) => slice(text, s))).toEqual(["let x = 1;", "if (x) {\n  go();\n}"]);
  });

  test("template element spans cover the raw text between delimiters", () => {
    const text = "`a${x}bc`";
    const template = parseExpression(text).expression as AST.TemplateLiteral;
    expect(template.quasis.map((q) => slice(text, q))).toEqual(["a", "bc"]);
    expect(slice(text, template.expressions[0]!)).toBe("x");
  });
});

describe("mapping to file offsets", () => {
  test("`offset` shifts every node and diagnostic", () => {
    const file = `<Button onClick="count + 1" />`;
    const valueStart = file.indexOf("count");
    const source = "count + 1";
    const { expression } = parseExpression(source, { offset: valueStart });
    expect(slice(file, expression!)).toBe("count + 1");
    expect(slice(file, (expression as AST.BinaryExpression).right)).toBe("1");

    const broken = parseExpression("count +", { offset: valueStart });
    expect(broken.diagnostics[0]!.start).toBe(valueStart + "count +".length);
  });

  test("`offsets` maps entity-decoded text back to the raw markup", () => {
    // Raw text "a &lt; b" decodes to "a < b"; the 'b' sits at raw index 7.
    const offsets = [100, 101, 102, 106, 107, 108];
    const { expression } = parseExpression("a < b", { offsets });
    const binary = expression as AST.BinaryExpression;
    expect(binary.start).toBe(100);
    expect(binary.right.start).toBe(107);
    expect(binary.end).toBe(108);
  });
});
