var HMP = require('hindley-milner-parser-js');
var FuzzySearch = require('fuse.js');

function takeWhile(f, xs) {
  var ys = [];
  for (var i = 0; i < xs.length; ++i) {
    var x = xs[i];
    if (f(x)) {
      ys.push(x);
    }
    else {
      break;
    }
  }
  return ys;
}

function pluck(key, xs) {
  var ys = [];
  for (var i = 0; i < xs.length; ++i) {
    ys.push(xs[i][key]);
  }
  return ys;
}

function when(pred, f) {
  return function(x) {
    return pred(x) ? f(x) : x;
  };
}

function take(n, xs) {
  return xs.slice(0, n);
}

function propIs(f, key) {
  return function(x) {
    return f(x[key]);
  };
}

function pathIs(f, path) {
  return function(x) {
    for (var i = 0; i < path.length; ++i) {
      x = x[path[i]];
    }
    return f(x);
  };
}

function isSubstr(sub) {
  return function(str) {
    return str.indexOf(sub) > -1;
  };
}

function lt(a) {
  return function(b) {
    return b < a;
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
    // if we couldn't compile, use entire string as name
    // so users can still find it
    x = {
      name: sig,
      constraints: [],
      type: { type: '??', text: '', children: [] }
    };
  }
  return x;
}

var MATCH_ALL_TYPES = {
  type: '*',
  text: '',
  children: []
};
var MATCH_ALL = {
  name: '*',
  constraints: [],
  type: MATCH_ALL_TYPES,
};

function nameParser(x) {
  x = x.trim();
  var spaceIdx = x.indexOf(' ');
  var name = spaceIdx > 0 ? x.substr(0, spaceIdx) : x;
  return {
    name: name,
    constraints: [],
    type: MATCH_ALL_TYPES
  };
}

var searchParsers = [
  HMP.parse,
  HMP.fn,
  HMP.method,
  HMP.typeConstructor,
  nameParser,
];

function runParsers(x) {
  var i;
  for (i = 0; i < searchParsers.length; ++i) {
    try {
      return searchParsers[i](x);
    }
    catch (e) {}
  }
  throw new Error('Could not parse search input (' + x + ')');
}

function searchParse(x) {
  if (x === '') {
    return MATCH_ALL;
  }
  else {
    var parsed = runParsers(x);
    if (!parsed.name) {
      parsed = {
        name: '*',
        constraints: [],
        type: parsed,
      };
    }
    if (parsed.type.type !== '*') {
      parsed.type = compileTypeVariables(parsed.type);
    }
    return parsed;
  }
}

// fuse has a default threshold of 0.6
// seems very liberal, for "good" results we'll use 0.4
// if we get anything better than that (lower value)
// only return those results
// if we don't have anything better, return 5 best results
var NAME_FUZZY_CUTOFF = 0.4;

function nameSearch(db, name) {
  if (name === '*') {
    return db;
  }
  var searcher = new FuzzySearch(db, {
    keys: ['name'],
    include: ['score'],
    threshold: 1,
  });
  var fuzzyResult = searcher.search(name);
  if (fuzzyResult.length === 0) {
    return [];
  }
  else {
    var keepers = takeWhile(propIs(lt(NAME_FUZZY_CUTOFF), 'score'), fuzzyResult);
    if (keepers.length === 0) {
      keepers = take(5, fuzzyResult);
    }
    else {
      if (isSubstr(name)(keepers[0].item.name)) {
        keepers = takeWhile(pathIs(isSubstr(name), ['item', 'name']), keepers);
      }
    }
    return pluck('item', keepers);
  }
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

function typeSearch(db, type) {
  if (type.type === '*') {
    return db;
  }
  var after = [];
  var i, entry;
  for (i = 0; i < db.length; ++i) {
    entry = db[i];
    if (typeSearch_(entry.type, type)) {
      after.push(entry);
    }
  }
  return after;
}

function compileIndexTypeVariables(item) {
  item.type = compileTypeVariables(item.type);
  return item;
}

function index(sigs) {
  return (sigs
    .map(indexParse)
    .map(when(isMethod, methodToFunction))
    .map(compileIndexTypeVariables)
  );
}

function search(db, input) {
  var parsed = searchParse(input);

  db = nameSearch(db, parsed.name);
  db = typeSearch(db, parsed.type);

  return db;
}

module.exports = {
  index: index,
  search: search,
};


