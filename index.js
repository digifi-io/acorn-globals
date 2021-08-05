'use strict';

const acorn = require('acorn');
const acornLoose = require('acorn-loose');
const walk = require('acorn-walk');

function isScope(node) {
  return node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration' || node.type === 'ArrowFunctionExpression' || node.type === 'Program';
}

function isBlockScope(node) {
  return node.type === 'BlockStatement' || isScope(node);
}

function declaresArguments(node) {
  return node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration';
}

function declaresThis(node) {
  return node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration';
}

function reallyParse(source, options, fallbackToLoose) {
  const parseOptions = Object.assign({}, options,
    {
      allowReturnOutsideFunction: true,
      allowImportExportEverywhere: true,
      allowHashBang: true,
      locations: true,
    },
  );

  try {
    const acornParseResult = acorn.parse(source, parseOptions);

    return {
      ast: acornParseResult,
    };
  } catch (err) {
    if (fallbackToLoose) {
      return {
        ast: acornLoose.parse(source, parseOptions),
        parsingError: err.message,
      };
    }

    throw err;
  }
}

function parseWithGlobals(source, options, fallbackToLoose) {
  options = options || {};

  const globals = [];

  const {
    ast,
    parsingError,
  } = (typeof source === 'string') ? reallyParse(source, options, fallbackToLoose) : { ast: source };

  // istanbul ignore if
  if (!(ast && typeof ast === 'object' && ast.type === 'Program')) {
    throw new TypeError('Source must be either a string of JavaScript or an acorn AST');
  }

  const declareFunction = function (node) {
    const fn = node;

    fn.locals = fn.locals || Object.create(null);
    node.params.forEach(function (node) {
      declarePattern(node, fn);
    });

    if (node.id) {
      fn.locals[node.id.name] = true;
    }
  };

  const declareClass = function (node) {
    node.locals = node.locals || Object.create(null);

    if (node.id) {
      node.locals[node.id.name] = true;
    }
  };

  const declarePattern = function (node, parent) {
    switch (node.type) {
      case 'Identifier':
        parent.locals[node.name] = true;
        break;
      case 'ObjectPattern':
        node.properties.forEach(function (node) {
          declarePattern(node.value || node.argument, parent);
        });
        break;
      case 'ArrayPattern':
        node.elements.forEach(function (node) {
          if (node) declarePattern(node, parent);
        });
        break;
      case 'RestElement':
        declarePattern(node.argument, parent);
        break;
      case 'AssignmentPattern':
        declarePattern(node.left, parent);
        break;
      // istanbul ignore next
      default:
        throw new Error('Unrecognized pattern type: ' + node.type);
    }
  };

  const declareModuleSpecifier = function (node) {
    ast.locals = ast.locals || Object.create(null);
    ast.locals[node.local.name] = true;
  };

  walk.ancestor(ast, {
    'VariableDeclaration': function (node, parents) {
      let parent = null;

      for (let i = parents.length - 1; i >= 0 && parent === null; i--) {
        if (node.kind === 'var' ? isScope(parents[i]) : isBlockScope(parents[i])) {
          parent = parents[i];
        }
      }

      parent.locals = parent.locals || Object.create(null);
      node.declarations.forEach(function (declaration) {
        declarePattern(declaration.id, parent);
      });
    },
    'FunctionDeclaration': function (node, parents) {
      let parent = null;

      for (let i = parents.length - 2; i >= 0 && parent === null; i--) {
        if (isScope(parents[i])) {
          parent = parents[i];
        }
      }

      parent.locals = parent.locals || Object.create(null);

      if (node.id) {
        parent.locals[node.id.name] = true;
      }

      declareFunction(node);
    },
    'Function': declareFunction,
    'ClassDeclaration': function (node, parents) {
      let parent = null;

      for (let i = parents.length - 2; i >= 0 && parent === null; i--) {
        if (isBlockScope(parents[i])) {
          parent = parents[i];
        }
      }

      parent.locals = parent.locals || Object.create(null);

      if (node.id) {
        parent.locals[node.id.name] = true;
      }

      declareClass(node);
    },
    'Class': declareClass,
    'TryStatement': function (node) {
      if (node.handler === null) {
        return;
      }

      node.handler.locals = node.handler.locals || Object.create(null);

      declarePattern(node.handler.param, node.handler);
    },
    'ImportDefaultSpecifier': declareModuleSpecifier,
    'ImportSpecifier': declareModuleSpecifier,
    'ImportNamespaceSpecifier': declareModuleSpecifier
  });

  function identifier(node, parents) {
    const name = node.name;

    if (name === 'undefined') {
      return;
    }

    for (let i = 0; i < parents.length; i++) {
      if (name === 'arguments' && declaresArguments(parents[i])) {
        return;
      }

      if (parents[i].locals && name in parents[i].locals) {
        return;
      }
    }

    node.parents = parents.slice();
    globals.push(node);
  }

  walk.ancestor(ast, {
    'VariablePattern': identifier,
    'Identifier': identifier,
    'ThisExpression': function (node, parents) {
      for (let i = 0; i < parents.length; i++) {
        if (declaresThis(parents[i])) {
          return;
        }
      }

      node.parents = parents.slice();
      globals.push(node);
    }
  });

  const groupedGlobals = Object.create(null);

  globals.forEach(function (node) {
    const name = node.type === 'ThisExpression' ? 'this' : node.name;

    groupedGlobals[name] = (groupedGlobals[name] || []);
    groupedGlobals[name].push(node);
  });
  
  return {
    ast,
    globals: Object.keys(groupedGlobals).sort().map((name) => ({
      name, nodes: groupedGlobals[name],
    })),
    parsingError,
  };
}

module.exports = parseWithGlobals;
module.exports.parse = reallyParse;
