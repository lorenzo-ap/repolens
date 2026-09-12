import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import {
  cognitiveComplexity,
  collectFunctions,
  cyclomaticComplexity,
  maxNestingDepth,
} from "../ast/functions";

function fns(code: string) {
  const project = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true });
  const sf = project.createSourceFile("/t.ts", code);
  return collectFunctions(sf);
}

describe("collectFunctions", () => {
  it("names functions from declarations, variables, methods and callbacks", () => {
    const list = fns(`
      function plain() {}
      const arrow = () => {};
      class K { method() {} get value() { return 1; } constructor() {} }
      items.map((x) => x);
      export default function () {}
    `);
    expect(list.map((f) => f.name)).toEqual([
      "plain",
      "arrow",
      "K.method",
      "K.value",
      "K.constructor",
      "items.map(callback)",
      "default",
    ]);
  });

  it("skips overloads and abstract members without bodies", () => {
    const list = fns(`
      function f(a: string): void;
      function f(a: number): void;
      function f(a: unknown) {}
      abstract class A { abstract m(): void; }
    `);
    expect(list).toHaveLength(1);
  });
});

describe("cyclomaticComplexity", () => {
  it("is 1 for a straight-line function", () => {
    const [f] = fns("function f() { return 1; }");
    expect(cyclomaticComplexity(f!.node)).toBe(1);
  });

  it("counts branches, loops, cases, catch and logical operators", () => {
    const [f] = fns(`
      function f(a, b) {
        if (a) {} else if (b) {}          // +2
        for (;;) {}                        // +1
        while (a) {}                       // +1
        switch (a) { case 1: break; case 2: break; default: } // +2
        try {} catch (e) {}                // +1
        const x = a && b || a ?? b;        // +3
        return a ? 1 : 2;                  // +1
      }
    `);
    expect(cyclomaticComplexity(f!.node)).toBe(12);
  });

  it("does not include nested functions in the parent's count", () => {
    const list = fns(`
      function outer() {
        const inner = () => { if (a) {} if (b) {} };
        if (c) {}
      }
    `);
    const outer = list.find((f) => f.name === "outer");
    const inner = list.find((f) => f.name === "inner");
    expect(cyclomaticComplexity(outer!.node)).toBe(2);
    expect(cyclomaticComplexity(inner!.node)).toBe(3);
  });
});

describe("cognitiveComplexity", () => {
  it("adds nesting increments (Sonar example)", () => {
    // From the Sonar spec: nested if inside for inside if.
    const [f] = fns(`
      function f(a, b, c) {
        if (a) {              // +1
          for (const x of b) { // +2 (nesting 1)
            if (c) {}          // +3 (nesting 2)
          }
        }
      }
    `);
    expect(cognitiveComplexity(f!.node)).toBe(6);
  });

  it("charges else-if and else without nesting increments", () => {
    const [f] = fns(`
      function f(a, b) {
        if (a) {}        // +1
        else if (b) {}   // +1
        else {}          // +1
      }
    `);
    expect(cognitiveComplexity(f!.node)).toBe(3);
  });

  it("counts sequences of the same logical operator once", () => {
    const [f] = fns("function f(a, b, c, d) { return a && b && c || d; }");
    // `&&` sequence +1, `||` change +1
    expect(cognitiveComplexity(f!.node)).toBe(2);
  });

  it("counts recursion", () => {
    const [f] = fns("function fact(n) { return n <= 1 ? 1 : n * fact(n - 1); }");
    // ternary +1, recursion +1
    expect(cognitiveComplexity(f!.node)).toBe(2);
  });
});

describe("maxNestingDepth", () => {
  it("measures nested control flow, ignoring else-if chains", () => {
    const [f] = fns(`
      function f(a) {
        if (a) { for (;;) { while (a) { try {} catch {} } } }
        if (a) {} else if (a) {} else if (a) {}
      }
    `);
    expect(maxNestingDepth(f!.node)).toBe(4);
  });
});
