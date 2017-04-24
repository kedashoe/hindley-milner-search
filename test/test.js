let Tape = require('tape');

let HMS = require('../src/hm-search.js');
let data = require('./data.json');

function pluck(key, xs) {
  var ys = [];
  for (var i = 0; i < xs.length; ++i) {
    ys.push(xs[i][key]);
  }
  return ys;
}

let runTest = db => t => (input, expected) => {
  let r = db.search(input);
  return t.deepEqual(pluck('signature', r).sort(), expected, input);
};

let testDefaults = runTest(HMS.init(data));

Tape.test('search by name', t => {
  let run = testDefaults(t);
  run('concat', [
    'Either#concat :: (Semigroup a, Semigroup b) => Either a b ~> Either a b -> Either a b',
    'Maybe#concat :: Semigroup a => Maybe a ~> Maybe a -> Maybe a',
    'concat :: Semigroup a => a -> a -> a'
  ]);
  run('flip', [
    'flip :: ((a, b) -> c) -> b -> a -> c'
  ]);
  run('zzzzz', [
  ]);
  run('map', [
    'Either#map :: Either a b ~> (b -> c) -> Either a c',
    'Maybe#@@type :: Maybe a ~> String',
    'Maybe#ap :: Maybe (a -> b) ~> Maybe a -> Maybe b',
    'Maybe#empty :: Maybe a ~> Maybe a',
    'Maybe#inspect :: Maybe a ~> () -> String',
    'Maybe#map :: Maybe a ~> (a -> b) -> Maybe b',
    'Maybe.empty :: () -> Maybe a',
    'MaybeType :: Type -> Type',
    'mapMaybe :: (a -> Maybe b) -> Array a -> Array b'
  ]);
  run('Maybe#map', [
    'Maybe#map :: Maybe a ~> (a -> b) -> Maybe b'
  ]);
  t.end();
});

Tape.test('search by type constructor', t => {
  let run = testDefaults(t);
  run('Maybe Integer', [
    'indexOf :: a -> List a -> Maybe Integer',
    'lastIndexOf :: a -> List a -> Maybe Integer',
    'parseInt :: Integer -> String -> Maybe Integer'
  ]);
  t.end();
});

// a single uppercase word could be a name or type
Tape.test('search by name or type', t => {
  let run = testDefaults(t);
  run('Integ', [
    'IntegBar :: Integer -> Bool',
    'IntegFoo :: a -> b',
    'at :: Integer -> List a -> Maybe a',
    'drop :: Integer -> List a -> Maybe (List a)',
    'dropLast :: Integer -> List a -> Maybe (List a)',
    'even :: Integer -> Boolean',
    'indexOf :: a -> List a -> Maybe Integer',
    'lastIndexOf :: a -> List a -> Maybe Integer',
    'odd :: Integer -> Boolean',
    'parseInt :: Integer -> String -> Maybe Integer',
    'range :: Integer -> Integer -> Array Integer',
    'slice :: Integer -> Integer -> List a -> Maybe (List a)',
    'take :: Integer -> List a -> Maybe (List a)',
    'takeLast :: Integer -> List a -> Maybe (List a)'
  ]);
  t.end();
});

Tape.test('search by function', t => {
  let run = testDefaults(t);
  run('Integer -> Integer', [
    'parseInt :: Integer -> String -> Maybe Integer',
    'range :: Integer -> Integer -> Array Integer',
    'slice :: Integer -> Integer -> List a -> Maybe (List a)'
  ]);
  run('a -> Maybe b', [
    'Maybe#ap :: Maybe (a -> b) ~> Maybe a -> Maybe b',
    'Maybe#chain :: Maybe a ~> (a -> Maybe b) -> Maybe b',
    'Maybe#equals :: Maybe a ~> b -> Boolean',
    'Maybe#of :: Maybe a ~> b -> Maybe b',
    'Maybe#reduce :: Maybe a ~> ((b, a) -> b) -> b -> b',
    'eitherToMaybe :: Either a b -> Maybe b',
    'encase :: (a -> b) -> a -> Maybe b',
    'maybe :: b -> (a -> b) -> Maybe a -> b',
    'maybeToEither :: a -> Maybe b -> Either a b',
    'maybe_ :: (() -> b) -> (a -> b) -> Maybe a -> b'
  ]);
  run('Either -> Maybe', [
    'eitherToMaybe :: Either a b -> Maybe b'
  ]);
  run('(a -> b) -> f a', [
    'lift :: Functor f => (a -> b) -> f a -> f b',
    'lift2 :: Apply f => (a -> b -> c) -> f a -> f b -> f c',
    'lift3 :: Apply f => (a -> b -> c -> d) -> f a -> f b -> f c -> f d'
  ]);
  t.end();
});

Tape.test('search by type variable', t => {
  let run = testDefaults(t);
  run('(x -> Boolean) -> y', [
    'ifElse :: (a -> Boolean) -> (a -> b) -> (a -> b) -> a -> b'
  ]);
  run('a -> Either b c', [
    'Either#chain :: Either a b ~> (b -> Either a c) -> Either a c',
    'Either#equals :: Either a b ~> c -> Boolean',
    'Either#of :: Either a b ~> c -> Either a c'
  ]);
  t.end();
});

Tape.test('search by name and type', t => {
  let run = testDefaults(t);
  run('concat :: Maybe', [
    'Maybe#concat :: Semigroup a => Maybe a ~> Maybe a -> Maybe a'
  ]);
  t.end();
});

let testNonFuzzy = runTest(HMS.init(data, {
  fuzzy: false,
}));

Tape.test('non-fuzzy search', t => {
  let run = testNonFuzzy(t);
  run('map', [
    'Either#map :: Either a b ~> (b -> c) -> Either a c',
    'Maybe#map :: Maybe a ~> (a -> b) -> Maybe b',
    'mapMaybe :: (a -> Maybe b) -> Array a -> Array b'
  ]);
  run('a -> Either b c', [
    'Either#chain :: Either a b ~> (b -> Either a c) -> Either a c',
    'Either#equals :: Either a b ~> c -> Boolean',
    'Either#of :: Either a b ~> c -> Either a c'
  ]);
  run('concat :: Maybe', [
    'Maybe#concat :: Semigroup a => Maybe a ~> Maybe a -> Maybe a'
  ]);
  t.end();
});

