import { Node, type SourceFile, SyntaxKind, type ts } from "ts-morph";

export type FunctionLike =
  | import("ts-morph").FunctionDeclaration
  | import("ts-morph").FunctionExpression
  | import("ts-morph").ArrowFunction
  | import("ts-morph").MethodDeclaration
  | import("ts-morph").ConstructorDeclaration
  | import("ts-morph").GetAccessorDeclaration
  | import("ts-morph").SetAccessorDeclaration;

export interface FunctionInfo {
  node: FunctionLike;
  name: string;
  line: number;
  endLine: number;
  /** Lines spanned by the function body. */
  loc: number;
  parameterCount: number;
}

export function isFunctionLike(node: Node): node is FunctionLike {
  return (
    Node.isFunctionDeclaration(node) ||
    Node.isFunctionExpression(node) ||
    Node.isArrowFunction(node) ||
    Node.isMethodDeclaration(node) ||
    Node.isConstructorDeclaration(node) ||
    Node.isGetAccessorDeclaration(node) ||
    Node.isSetAccessorDeclaration(node)
  );
}

/** Derives a readable name for a function-like node, walking up through variable/property assignments. */
export function functionName(node: FunctionLike): string {
  if (Node.isConstructorDeclaration(node)) {
    const cls = node.getParent();
    return `${Node.isClassDeclaration(cls) || Node.isClassExpression(cls) ? (cls.getName() ?? "class") : "class"}.constructor`;
  }
  if (
    Node.isMethodDeclaration(node) ||
    Node.isGetAccessorDeclaration(node) ||
    Node.isSetAccessorDeclaration(node)
  ) {
    const owner = node.getParent();
    const ownerName =
      Node.isClassDeclaration(owner) || Node.isClassExpression(owner)
        ? (owner.getName() ?? "class")
        : null;
    const n = node.getName();
    return ownerName ? `${ownerName}.${n}` : n;
  }
  if (Node.isFunctionDeclaration(node)) return node.getName() ?? "default";
  const parent = node.getParent();
  if (Node.isVariableDeclaration(parent)) return parent.getName();
  if (Node.isPropertyAssignment(parent)) return parent.getName();
  if (Node.isPropertyDeclaration(parent)) return parent.getName();
  if (
    Node.isBinaryExpression(parent) &&
    parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken
  ) {
    return parent.getLeft().getText();
  }
  if (Node.isCallExpression(parent)) {
    const callee = parent.getExpression().getText();
    return `${callee}(callback)`;
  }
  if (Node.isExportAssignment(parent)) return "default";
  if (Node.isJsxAttribute(parent) || Node.isJsxExpression(parent)) return "(jsx handler)";
  return "(anonymous)";
}

/**
 * Enumerates every function-like node in a file. Arrow functions that are direct arguments of a
 * call are still included (they are real functions with real complexity) but their names say so.
 */
export function collectFunctions(sourceFile: SourceFile): FunctionInfo[] {
  const result: FunctionInfo[] = [];
  sourceFile.forEachDescendant((node) => {
    if (!isFunctionLike(node)) return;
    const body = node.getBody();
    if (!body) return; // overloads and abstract members
    const line = node.getStartLineNumber();
    const endLine = node.getEndLineNumber();
    result.push({
      node,
      name: functionName(node),
      line,
      endLine,
      loc: endLine - line + 1,
      parameterCount: node.getParameters().length,
    });
  });
  return result;
}

const CYCLOMATIC_KINDS = new Set<SyntaxKind>([
  SyntaxKind.IfStatement,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.CaseClause,
  SyntaxKind.CatchClause,
  SyntaxKind.ConditionalExpression,
]);

const LOGICAL_OPERATORS = new Set<SyntaxKind>([
  SyntaxKind.AmpersandAmpersandToken,
  SyntaxKind.BarBarToken,
  SyntaxKind.QuestionQuestionToken,
]);

/**
 * Cyclomatic complexity (McCabe): 1 + one per decision point. Nested functions are excluded from
 * their parent's count and measured separately, matching how ESLint's `complexity` rule reports.
 */
export function cyclomaticComplexity(fn: FunctionLike): number {
  let complexity = 1;
  const body = fn.getBody();
  if (!body) return complexity;
  const visit = (node: Node): void => {
    if (node !== body && isFunctionLike(node)) return;
    const kind = node.getKind();
    if (CYCLOMATIC_KINDS.has(kind)) complexity++;
    else if (
      Node.isBinaryExpression(node) &&
      LOGICAL_OPERATORS.has(node.getOperatorToken().getKind())
    )
      complexity++;
    node.forEachChild(visit);
  };
  visit(body);
  return complexity;
}

/**
 * Cognitive complexity following the SonarSource specification (v1.5):
 * - +1 for each break in linear flow: if, else if, else, ternary, switch, loops, catch, goto-like
 *   jumps to labels, sequences of binary logical operators, and recursion.
 * - +nesting level for structures that also increase nesting (if, ternary, switch, loops, catch).
 * - Nested functions increase nesting for their contents but add nothing themselves.
 */
export function cognitiveComplexity(fn: FunctionLike): number {
  let total = 0;
  const body = fn.getBody();
  if (!body) return 0;
  const fnName =
    Node.isFunctionDeclaration(fn) || Node.isMethodDeclaration(fn) ? fn.getName() : undefined;

  const visit = (node: Node, nesting: number): void => {
    if (node !== body && isFunctionLike(node)) {
      const inner = node.getBody();
      if (inner) visit(inner, nesting + 1);
      return;
    }
    switch (node.getKind()) {
      case SyntaxKind.IfStatement: {
        const ifNode = node.asKindOrThrow(SyntaxKind.IfStatement);
        const parent = ifNode.getParent();
        const isElseIf = Node.isIfStatement(parent) && parent.getElseStatement() === ifNode;
        // `else if` costs 1 without a nesting increment; a fresh `if` costs 1 + nesting.
        total += isElseIf ? 1 : 1 + nesting;
        visit(ifNode.getExpression(), nesting);
        visit(ifNode.getThenStatement(), nesting + 1);
        const elseStmt = ifNode.getElseStatement();
        if (elseStmt) {
          if (Node.isIfStatement(elseStmt)) visit(elseStmt, nesting);
          else {
            total += 1;
            visit(elseStmt, nesting + 1);
          }
        }
        return;
      }
      case SyntaxKind.ConditionalExpression:
      case SyntaxKind.SwitchStatement:
      case SyntaxKind.ForStatement:
      case SyntaxKind.ForInStatement:
      case SyntaxKind.ForOfStatement:
      case SyntaxKind.WhileStatement:
      case SyntaxKind.DoStatement:
      case SyntaxKind.CatchClause:
        total += 1 + nesting;
        node.forEachChild((c) => visit(c, nesting + 1));
        return;
      case SyntaxKind.BreakStatement:
      case SyntaxKind.ContinueStatement: {
        const label = (node.compilerNode as ts.BreakOrContinueStatement).label;
        if (label) total += 1;
        return;
      }
      case SyntaxKind.BinaryExpression: {
        const bin = node.asKindOrThrow(SyntaxKind.BinaryExpression);
        const op = bin.getOperatorToken().getKind();
        if (LOGICAL_OPERATORS.has(op)) {
          // A sequence of the same operator counts once; a change of operator counts again.
          const parent = bin.getParent();
          const parentOp = Node.isBinaryExpression(parent)
            ? parent.getOperatorToken().getKind()
            : undefined;
          if (parentOp !== op) total += 1;
        }
        node.forEachChild((c) => visit(c, nesting));
        return;
      }
      case SyntaxKind.CallExpression: {
        const call = node.asKindOrThrow(SyntaxKind.CallExpression);
        if (fnName && call.getExpression().getText() === fnName) total += 1; // recursion
        node.forEachChild((c) => visit(c, nesting));
        return;
      }
      default:
        node.forEachChild((c) => visit(c, nesting));
    }
  };
  visit(body, 0);
  return total;
}

/** Maximum depth of nested control-flow blocks within a function (functions inside are excluded). */
export function maxNestingDepth(fn: FunctionLike): number {
  const body = fn.getBody();
  if (!body) return 0;
  let max = 0;
  const NESTING = new Set<SyntaxKind>([
    SyntaxKind.IfStatement,
    SyntaxKind.ForStatement,
    SyntaxKind.ForInStatement,
    SyntaxKind.ForOfStatement,
    SyntaxKind.WhileStatement,
    SyntaxKind.DoStatement,
    SyntaxKind.SwitchStatement,
    SyntaxKind.TryStatement,
    SyntaxKind.ConditionalExpression,
  ]);
  const visit = (node: Node, depth: number): void => {
    if (node !== body && isFunctionLike(node)) return;
    let d = depth;
    if (NESTING.has(node.getKind())) {
      const parent = node.getParent();
      const isElseIf =
        Node.isIfStatement(node) &&
        Node.isIfStatement(parent) &&
        parent.getElseStatement() === node;
      if (!isElseIf) d = depth + 1;
      if (d > max) max = d;
    }
    node.forEachChild((c) => visit(c, d));
  };
  visit(body, 0);
  return max;
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
