var HMP = require('hindley-milner-parser-js');

function pipe(x, fs) {
  for (var i = 0; i < fs.length; ++i) {
    x = fs[i](x);
  }
  return x;
}

function when(pred, f) {
  return function(x) {
    return pred(x) ? f(x) : x;
  };
}

function or(preds) {
  return function(opts, x) {
    for (var i = 0; i < preds.length; ++i) {
      if (preds[i](opts, x)) {
        return true;
      }
    }
    return false;
  };
}

function and(preds) {
  return function(opts, x) {
    for (var i = 0; i < preds.length; ++i) {
      if (!preds[i](opts, x)) {
        return false;
      }
    }
    return true;
  };
}

function isMethod(x) {
  return x.type.type === 'method';
}

// mutating!
function methodToFunction(x) {
  var type = x.type;
  type.type = 'function';
  var a = type.children[0];
  var i;
  for (i = 1; i < type.children.length - 1; ++i) {
    type.children[i - 1] = type.children[i];
  }
  type.children[i] = a;
  return x;
}

function TypeClone(type) {
  return {
    type: type.type,
    text: type.text,
    children: [],
  };
}

// depth first
// eg
// (b -> c) -> a -> c
// becomes
// (t0 -> t1) -> t2 -> t1
function _compileTypeVariables(type, state) {
  var compiled = TypeClone(type);
  if (type.type === 'typevar') {
    if (!(type.text in state.vars)) {
      state.vars[type.text] = 't'+state.counter;
      state.counter++;
    }
    compiled.text = state.vars[type.text];
  }
  for (var i = 0; i < type.children.length; ++i) {
    compiled.children.push(_compileTypeVariables(type.children[i], state));
  }
  return compiled;
}

function compileTypeVariables(type) {
  var state = {
    counter: 0,
    vars: {},
  };
  return _compileTypeVariables(type, state);
}

// todo: move parsed value to its own field
// we are mixing the object returned by HMP.parse with our own fields
function indexParse(sig, i) {
  var indexed = databaseParse(sig);
  indexed.signature = sig;
  indexed.pointer = i;
  return indexed;
}

function databaseParse(sig) {
  var x;
  try {
    x = HMP.parse(sig);
  }
  catch (e) {
    // if we couldn't compile, get name
    // set type to unknown
    x = nameParser(sig);
    x.type = { type: '??', text: '', children: [] };
  }
  return x;
}

function nameParser(x) {
  x = x.trim();
  var spaceIdx = x.indexOf(' ');
  var name = spaceIdx > 0 ? x.substr(0, spaceIdx) : x;
  return {
    name: name,
    constraints: [],
    type: false,
  };
}

function tryParser(name, x) {
  try {
    var parsed = HMP[name](x);
    return [name, parsed];
  }
  catch (e) {
    return false;
  }
}

/*
 * `HMP.parse` returns a record:
 * Signature {
 *   name: String,
 *   constraints: [Constraint],
 *   type: TypeTree
 * }
 * The rest of the parsers we try (`fn`, etc) simply return a TypeTree.
 * If `parse` fails and one of the others succeeds,
 * wrap the TypeTree in a Signature
 */
function wrapParsedTypeNode(parsed) {
  return [
    parsed[0],
    {
      name: false,
      constraints: [],
      type: parsed[1]
    }
  ];
}

function runParsers(x) {
  // try to parse as complete signature
  var parsed = tryParser('parse', x);
  if (parsed !== false) {
    return parsed;
  }
  else {
    // try other parsers that we want to allow users to search for
    var searchParsers = [
      'fn',
      'method',
      'typeConstructor',
    ];
    for (var i = 0; i < searchParsers.length; ++i) {
      parsed = tryParser(searchParsers[i], x);
      if (parsed !== false) {
        return wrapParsedTypeNode(parsed);
      }
    }
    // hindley milner parsings failed, return name search
    return ['name', nameParser(x)];
  }
}

// :: String -> (Signature -> Bool)
function searchParse(x) {
  var parsed = runParsers(x);
  var by = parsed[0];
  var ast = parsed[1];
  if (ast.type !== false) {
    ast.type = compileTypeVariables(ast.type);
  }
  // special case: a single uppercase word could be a name or typeConstructor
  if (by === 'typeConstructor' && /^\S+$/.test(x)) {
    return or([nameSearch(nameParser(x)), typeSearch(ast)]);
  }
  else {
    var preds = [];
    if (ast.name !== false) {
      preds.push(nameSearch(ast));
    }
    if (ast.type !== false) {
      preds.push(typeSearch(ast));
    }
    return and(preds);
  }
}

function fuzzyScore(item, input) {
  item = item.toLowerCase();
  var i = 0;
  var j = 0;
  var score = 0;
  var run = 1;
  for (; i < input.length; ++i, ++j) {
    for (; j < item.length; ++j) {
      if (input[i] === item[j]) {
        score += run;
        run *= 2;
        break;
      }
      else {
        run = 1;
      }
    }
    if (j === item.length) {
      // did not match, negative score!
      return -1;
    }
  }
  // divide score by length of item so
  // "foo" matches "foo" better than "foobar"
  return score / item.length;
}

function nameSearch(input) {
  return function(opts, item) {
    var itemName = item.name.toLowerCase();
    var inputName = input.name.toLowerCase();
    if (opts.fuzzy) {
      return nameSearchFuzzy(itemName, inputName);
    }
    else {
      return nameSearchSubstring(itemName, inputName);
    }
  };
}

function nameSearchSubstring(itemName, inputName) {
  return itemName.indexOf(inputName) > -1;
}

function nameSearchFuzzy(itemName, inputName) {
  return fuzzyScore(itemName, inputName) > 0;
}

function typeSearch_(dbType, queryType) {
  var isMatch = true;
  if (dbType.type !== queryType.type) {
    isMatch = false;
  }
  if (queryType.text.length > 0 && dbType.text.indexOf(queryType.text) < 0) {
    isMatch = false;
  }
  if (isMatch) {
    // we matched and no children
    if (queryType.children.length === 0) {
      return true;
    }
    var j = 0;
    for (var i = 0; i < queryType.children.length; ++i) {
      var queryChild = queryType.children[i];
      for (; j < dbType.children.length; ++j) {
        if (typeSearch_(dbType.children[j], queryChild)) {
          // if we match last query child, we are done
          if (i === queryType.children.length - 1) {
            return true;
          }
          ++j;
          break;
        }
      }
      if (j === dbType.children.length) {
        return false;
      }
    }
    throw new Error('??');
  }
  // no match, stay at same play in query, check db children
  else {
    for (var i = 0; i < dbType.children.length; ++i) {
      if (typeSearch_(dbType.children[i], queryType)) {
        return true;
      }
    }
    return false;
  }
}

function typeSearch(input) {
  return function(opts, item) {
    return typeSearch_(item.type, input.type);
  };
}

function compileIndexTypeVariables(item) {
  item.type = compileTypeVariables(item.type);
  return item;
}

function buildDb(sigs) {
  return (sigs
    .map(indexParse)
    .map(when(isMethod, methodToFunction))
    .map(compileIndexTypeVariables)
  );
}

function init(data, opts) {
  if (opts == null) {
    opts = {
      fuzzy: true,
    };
  }
  var db = buildDb(data);
  return {
    search: function search(input) {
      // if input is empty, return everything
      if (input.trim() === '') {
        return db;
      }
      var test = searchParse(input);
      return db.filter(function(x) {
        return test(opts, x);
      });
    },
  };
}

module.exports = {
  init: init,
};

