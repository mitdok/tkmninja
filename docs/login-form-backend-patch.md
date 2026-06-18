# Backend change needed for split login form

The frontend PR in `mitdok/tkmonline` sends login as:

```js
'b' + JSON.stringify({ name: uid, tripKey: tripKey })
```

`app.js` currently parses only the legacy `name#key` format inside `login()`.

Apply this logic before creating the trip:

```js
var parseLoginPayload = function (payload) {
  var parsed;

  if (payload && payload[0] === '{') {
    try {
      parsed = JSON.parse(payload);
    } catch (e) {}
  }

  if (parsed && typeof parsed === 'object') {
    return {
      name: String(parsed.name || ''),
      tripKey: String(parsed.tripKey || '')
    };
  }

  var token = payload.split('#', 2);
  return {
    name: token[0],
    tripKey: token.length > 1 ? token[1] : ''
  };
};
```

Then change the start of `login()` from the legacy split to:

```js
var loginPayload = parseLoginPayload(splitSyntaxType1(message));
var name = loginPayload.name.replace(/^\s+|\s+$/g, '');
var uid = name;
var src = loginPayload.tripKey;
```

This keeps old `name#key` clients working while accepting the new two-field form payload.
