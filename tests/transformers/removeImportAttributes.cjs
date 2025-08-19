// CommonJS transformer for ts-jest
// Removes `with { type: "json" }` from import declarations at test-compile time.

const ts = require("typescript");

function factory() {
  return (context) => {
    const visit = (node) => {
      // import x from "y" with { type: "json" }  -->  import x from "y"
      if (ts.isImportDeclaration(node) && node.attributes) {
        return ts.factory.updateImportDeclaration(
          node,
          node.modifiers,
          node.importClause ?? undefined,
          node.moduleSpecifier,
          /* attributes */ undefined,
        );
      }
      return ts.visitEachChild(node, visit, context);
    };

    // IMPORTANT: use visitEachChild here (not visitNode)
    return (sourceFile) => ts.visitEachChild(sourceFile, visit, context);
  };
}

module.exports = { factory };
