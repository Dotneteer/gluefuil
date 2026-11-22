// Prints a script syntax tree as a compact S-expression, so conformance
// tables can state structure and precedence readably:
//   a + b * c      -> (+ a (* b c))
//   a?.b()         -> (chain (call (?. a b)))
//   let [x] = y    -> (let (= (arrpat x) y))
import type * as AST from "../../src/script/ast";

type Printable = AST.Node | null;

const list = (head: string, ...items: string[]) => `(${[head, ...items].join(" ")})`;

export function print(node: Printable): string {
  if (node === null) return "_";
  switch (node.type) {
    case "Program":
      return node.body.map(print).join(" ");
    case "Identifier":
      return node.name;
    case "Literal":
      return node.raw;
    case "TemplateLiteral": {
      const parts: string[] = [];
      node.quasis.forEach((quasi, index) => {
        if (quasi.value.cooked !== "") parts.push(JSON.stringify(quasi.value.cooked));
        if (index < node.expressions.length) parts.push(print(node.expressions[index]!));
      });
      return list("template", ...parts);
    }
    case "TemplateElement":
      return JSON.stringify(node.value.cooked);
    case "ArrayExpression":
      return list("array", ...node.elements.map(print));
    case "ObjectExpression":
      return list("object", ...node.properties.map(print));
    case "Property": {
      const key = node.computed ? `[${print(node.key)}]` : print(node.key);
      if (node.kind !== "init") return list(node.kind, key, print(node.value));
      if (node.method) return list("method", key, print(node.value));
      if (node.shorthand && node.value.type === "Identifier") return list("prop", key);
      return list("prop", key, print(node.value));
    }
    case "SpreadElement":
    case "RestElement":
      return list("...", print(node.argument));
    case "FunctionExpression":
    case "FunctionDeclaration":
      return list(
        node.async ? "async-function" : "function",
        node.id ? node.id.name : "_",
        list("params", ...node.params.map(print)),
        print(node.body),
      );
    case "ArrowFunctionExpression":
      return list(node.async ? "async=>" : "=>", list("params", ...node.params.map(print)), print(node.body));
    case "UnaryExpression":
      return list(node.operator, print(node.argument));
    case "UpdateExpression":
      return node.prefix ? list(node.operator, print(node.argument)) : list(`${node.operator}post`, print(node.argument));
    case "BinaryExpression":
    case "LogicalExpression":
    case "AssignmentExpression":
      return list(node.operator, print(node.left), print(node.right));
    case "ConditionalExpression":
      return list("?", print(node.test), print(node.consequent), print(node.alternate));
    case "CallExpression":
      return list(node.optional ? "call?." : "call", print(node.callee), ...node.arguments.map(print));
    case "NewExpression":
      return list("new", print(node.callee), ...node.arguments.map(print));
    case "MemberExpression": {
      const operator = (node.optional ? "?." : ".") + (node.computed ? "[]" : "");
      return list(operator, print(node.object), print(node.property));
    }
    case "ChainExpression":
      return list("chain", print(node.expression));
    case "SequenceExpression":
      return list(",", ...node.expressions.map(print));
    case "AwaitExpression":
      return list("await", print(node.argument));
    case "ObjectPattern":
      return list("objpat", ...node.properties.map(print));
    case "ArrayPattern":
      return list("arrpat", ...node.elements.map(print));
    case "AssignmentPattern":
      return list("default", print(node.left), print(node.right));
    case "ExpressionStatement":
      return print(node.expression);
    case "BlockStatement":
      return list("block", ...node.body.map(print));
    case "EmptyStatement":
      return "(empty)";
    case "VariableDeclaration":
      return list(node.kind, ...node.declarations.map(print));
    case "VariableDeclarator":
      return node.init ? list("=", print(node.id), print(node.init)) : print(node.id);
    case "IfStatement":
      return node.alternate
        ? list("if", print(node.test), print(node.consequent), print(node.alternate))
        : list("if", print(node.test), print(node.consequent));
    case "WhileStatement":
      return list("while", print(node.test), print(node.body));
    case "DoWhileStatement":
      return list("do", print(node.body), print(node.test));
    case "ForStatement":
      return list("for", print(node.init), print(node.test), print(node.update), print(node.body));
    case "ForInStatement":
      return list("for-in", print(node.left), print(node.right), print(node.body));
    case "ForOfStatement":
      return list("for-of", print(node.left), print(node.right), print(node.body));
    case "BreakStatement":
      return "(break)";
    case "ContinueStatement":
      return "(continue)";
    case "ReturnStatement":
      return node.argument ? list("return", print(node.argument)) : "(return)";
    case "ThrowStatement":
      return list("throw", print(node.argument));
    case "TryStatement":
      return list("try", print(node.block), print(node.handler), print(node.finalizer));
    case "CatchClause":
      return list("catch", print(node.param), print(node.body));
    case "SwitchStatement":
      return list("switch", print(node.discriminant), ...node.cases.map(print));
    case "SwitchCase":
      return list(node.test ? "case" : "default", ...(node.test ? [print(node.test)] : []), ...node.consequent.map(print));
    case "ImportDeclaration":
      return list("import", ...node.specifiers.map(print), print(node.source));
    case "ExportNamedDeclaration":
      return list("export", print(node.declaration));
    case "ImportSpecifier":
      return node.imported.name === node.local.name ? node.local.name : list("as", node.imported.name, node.local.name);
  }
}
