let Tape = require('tape');

let HMS = require('../src/hm-search.js');
let data = require('./data.json');

Error.stackTraceLimit = Infinity;
global.cl = console.log.bind(console);
global.show = x => JSON.stringify(x, null, 2);
let _showType = (t, depth) => {
  let s = '  '.repeat(depth)+`${t.type}(${t.text})\n`;
  for (let i = 0; i < t.children.length; ++i) {
    s += _showType(t.children[i], depth + 1);
  }
  return s;
};
global.showType = t => {
  return _showType(t, 0);
}

function pluck(key, xs) {
  var ys = [];
  for (var i = 0; i < xs.length; ++i) {
    ys.push(xs[i][key]);
  }
  return ys;
}

let runTest = db => t => (input, expected) => {
  let r = HMS.search(db, input);
  return t.deepEqual(pluck('signature', r), expected, input);
};

let testWith = runTest(HMS.index(data));

Tape.test('search by name', t => {
  let run = testWith(t);
  run('concat', [
    'concat :: Semigroup a => a -> a -> a',
    'Maybe#concat :: Semigroup a => Maybe a ~> Maybe a -> Maybe a',
    'Either#concat :: (Semigroup a, Semigroup b) => Either a b ~> Either a b -> Either a b'
  ]);
  run('flip', ['flip :: ((a, b) -> c) -> b -> a -> c']);
  run('zzzzz', []);
  run('map', [
    'mapMaybe :: (a -> Maybe b) -> Array a -> Array b',
    'Maybe#map :: Maybe a ~> (a -> b) -> Maybe b',
    'Either#map :: Either a b ~> (b -> c) -> Either a c'
  ]);
  run('Maybe#map', ['Maybe#map :: Maybe a ~> (a -> b) -> Maybe b']);
  t.end();
});

Tape.test('search by type constructor', t => {
  let run = testWith(t);
  run('Maybe Integer', [
    'indexOf :: a -> List a -> Maybe Integer',
    'lastIndexOf :: a -> List a -> Maybe Integer',
    'parseInt :: Integer -> String -> Maybe Integer'
  ]);
  t.end();
});

Tape.test('search by function', t => {
  let run = testWith(t);
  run('Integer -> Integer', [
    'slice :: Integer -> Integer -> List a -> Maybe (List a)',
    'range :: Integer -> Integer -> Array Integer',
    'parseInt :: Integer -> String -> Maybe Integer'
  ]);
  run('a -> Maybe b', [
    'Maybe#ap :: Maybe (a -> b) ~> Maybe a -> Maybe b',
    'Maybe#chain :: Maybe a ~> (a -> Maybe b) -> Maybe b',
    'encase :: (a -> b) -> a -> Maybe b',
    'maybeToEither :: a -> Maybe b -> Either a b',
    'eitherToMaybe :: Either a b -> Maybe b',
    'get :: Accessible a => TypeRep b -> String -> a -> Maybe b',
    'gets :: Accessible a => TypeRep b -> Array String -> a -> Maybe b'
  ]);
  run('Either -> Maybe', ['eitherToMaybe :: Either a b -> Maybe b']);
  run('(a -> b) -> f a', [
    'lift :: Functor f => (a -> b) -> f a -> f b',
    'lift2 :: Apply f => (a -> b -> c) -> f a -> f b -> f c',
    'lift3 :: Apply f => (a -> b -> c -> d) -> f a -> f b -> f c -> f d'
  ]);
  t.end();
});

Tape.test('search by name and type', t => {
  let run = testWith(t);
  run('concat :: Maybe', ['Maybe#concat :: Semigroup a => Maybe a ~> Maybe a -> Maybe a']);
  t.end();
});

