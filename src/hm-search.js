var HMP = require('hindley-milner-parser-js');

function pluck(key, xs) {
  var ys = [];
  for (var i = 0; i < xs.length; ++i) {
    ys.push(xs[i][key]);
  }
  return ys;
}

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

function scoreCmp(a, b) {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  else {
    return b.item.name > a.item.name ? 1 : -1;
  }
}

function scoreSort(x) {
  return x.sort(scoreCmp);
}

function nameSearch(opts, input) {
  return function(db) {
    if (input === '*') {
      return db;
    }
    else {
      if (opts.fuzzy) {
        return nameSearchFuzzy(db, input);
      }
      else {
        return nameSearchSubstring(db, input);
      }
    }
  };
}

function nameSearchSubstring(db, input) {
  input = input.toLowerCase();
  return db.filter(function(x) {
    return x.name.toLowerCase().indexOf(input) > -1;
  });
}

function nameSearchFuzzy(db, input) {
  var i, item, score;
  var r = [];
  input = input.toLowerCase();
  for (i = 0; i < db.length; ++i) {
    item = db[i];
    score = fuzzyScore(item.name, input);
    if (score > 0) {
      r.push({
        item: item,
        score: score,
      });
    }
  }
  return pluck('item', scoreSort(r));
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

function typeSearch(type) {
  return function(db) {
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
      var parsed = searchParse(input);
      return pipe(db, [
        nameSearch(opts, parsed.name),
        typeSearch(parsed.type),
      ]);
    },
  };
}

module.exports = {
  init: init,
};

