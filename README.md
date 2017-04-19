# Hindley Milner Search

Search a list of [Hindley-Milner](https://en.wikipedia.org/wiki/Hindley%E2%80%93Milner_type_system) signatures.

```js
const HMS = require('hindley-milner-search');
const lib = [
  'foo :: Int -> String',
  'bar :: Int -> Int',
  'blam :: Int -> Maybe Int'
];
const db = HMS.init(lib);
const results = db.search('Int -> Maybe Int');
console.log(results); /* -> [{
  signature: 'blam :: Int -> Maybe Int',
  pointer: 2,
  name: 'blam',
  constraints: [],
  type: { ... }
}] */
```

