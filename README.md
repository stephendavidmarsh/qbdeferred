QB Deferred
===========

QB Deferred is a JavaScript library that implements an interface to the [Quickbase API](http://www.quickbase.com/api-guide/index.html#intro.html) using jQuery's [Deferred](http://api.jquery.com/category/deferred-object/) objects. It is entirely asynchronous. Most methods return jQuery Deferred objects that can be conveniently combined with `pipe`, `when`, `fail`, etc. It implements a higher-level API than what the Quickbase API itself provides. QB Deferred frees you from processing XML and concatenating strings to build Quickbase queries. Instead, QB Deferred lets you use plain old JavaScript objects and arrays. Often, a single call to a method of QB Deferred will implement an action that makes several calls to Quickbase.

Setup
-----

To use QB Deferred, your page must include at least jQuery 1.5, and [`qbdeferred.js`](https://github.com/stephendavidmarsh/qbdeferred/blob/master/qbdeferred.js).

If your Quickbase application requires apptokens, include a call to `setQBApptoken`.

    setQBApptoken("apptoken_here")

QBTable
-------

```js
new QBTable(dbid, fields)
```

All interaction with Quickbase is done through QBTable objects, each of which represents the interface to a single Quickbase table. The constructor takes the DBID and a object with key/value pairs for the fields of the table. The keys are names for the fields that can be used in method calls on the resulting QBTable instance – whenever you provide a field to QB Deferred, you can use either one of these names or a FID. The values give the FID and any conversions that should be applied when communicating with Quickbase. It can be in one of three forms:

- It can be a number, to give a FID and apply no conversions.
- It can be an object with a single key representing conversions to apply, with the FID as the value. The only keys supported are 'date' and 'numeric', for automatic conversion to and from JavaScript Date objects or Number values. Example: `{date: 7}`.
- It can be an object with a `fid` property and optional `inConverter` and `outConverter` properties. `inConverter` and `outConverter` are functions. `inConverter` is used to automatically convert values coming from a Quickbase query, `outConverter` handles values going to Quickbase. Example: `{fid: 9, outConverter: function (x) { return x / 1000 / 3600 }}`

Note that you can still interact with Quickbase fields that you didn't specify in your fields object using a plain FID.

**Example:**

```js
var qbtable = new QBTable(
  'DBID_HERE', {
    thebool: 6,
    thedate: {date: 7},
    thenumeric: {numeric: 10}
    thetext: 8,
    theduration: {fid: 9, outConverter: function (x) { return x / 1000 / 3600 }}
  }
)
```

`theduration` is a Duration field with its Value display set to Hours. The Quickbase API returns these values in milliseconds but expects them back in hours. The outConverter here allows you to simply work with milliseconds in all client code.

Deferred/Promise Objects
----------------

All of QBTable's methods return jQuery Promise objects. In jQuery's lingo, a Promise represent the future result of an operation, and a Deferred represents the requirement to fulfill a Promise. Most of Deferred's methods are available through a Promise, and the names are often used interchangeably. In this documentation, Deferred is used even when referring to Promise objects.

A Deferred is said to be "resolved" when its operation completes, and it is "resolved" with the result of that operation. If the operation does not complete successfully, it will instead be "rejected" with an error value. Deferred objects can be chained together, with values passing from one operation to the next.

Query Method
------------

```js
qbtable.query(query, clist, [slist], [options])
```

The QBTable's `query` method allows you to query QB records. `query` and `clist` are required, `slist` and `options` are optional.

###Specifying a Query

You can use a string containing a Quickbase query for the `query` parameter. However, QB Deferred also supports a simpler, structured form for specifying queries. You can use an object, whose keys represent the fields to filter on and the values the filters to apply. The value can either be another object, whose key/value pairs are a query operator and right hand value, or a non-object to do only equality comparison.

Use the empty string to query all records.

**Examples:**

```js
qbtable.query("{'3'.EX.'5'}OR{'3'.EX.'6'}", 3)
qbtable.query({thetext: "abc", thebool: true}, 3)
qbtable.query({thedate: {lt: new Date, gt: 0}, theduration: {xex: 0}}, 3)
qbtable.query('', 3)
```

###Column List

The `clist` can either be a single field, or an array of fields.

**Examples:**

```js
qbtable.query('', 3)
qbtable.query('', 'thetext')
qbtable.query('', [3, 'thetext', 'thedate'])
```

###Sort List

The `slist` can either be a single field, or an array of fields. You can also use `{desc: field}` to specify descending sort order.

**Examples:**

```js
qbtable.query('', 3, 3)
qbtable.query('', 3, {desc: 3})
qbtable.query('', 3, ['thetext', {desc: 'thedate'}])
```

###Options

The `options` parameter is an object with optional key/value pairs. `skip` can be used to skip over a number of Quickbase records that would otherwise be returned. `limit` limits the query to returning a certain number of records.

**Example:**

```js
qbtable.query('', 3, undefined, {skip: 10, limit: 10})
```

###Return Value

The Deferred returned by the `query` method will be resolved with an array, with an element for each record. If you gave an array for the `clist` these elements will be objects. The objects will have a field for each column specified in the `clist`. If you specified a column by name, there will also be a field for the corresponding FID. If you used a simple value for your `clist`, the resulting array will be simply the values from that column.

**Examples:**

```js
// Resolves with something like ['1', '2']
qbtable.query('', 3)
// Resolves with something like [{3: 1, thetext: 'abc', 8: 'abc'},
//                               {3: 2, thetext: 'def', 8: 'def'}]
qbtable.query('', [3, 'thetext'])
```

Count Method
------------

```js
qbtable.count(query)
```

The `count` method takes a query (see [above](#specifying-a-query)) and returns a Deferred that resolves with the number of records that match that query.

Add Method
----------

```js
qbtable.add(obj)
qbtable.add(objs)
```

The `add` method takes an object or an array of objects that represent records to be created. Each key/value in an object is a field and the value to set it to. There is no requirement for each object to have the same set of fields.

If `add` is called with an array, the returned Deferred will be resolved with an array of new RIDs. Their order corresponds to the order of the objects in the array passed to `add`. If `add` is called with a single object, it will be resolved with the sole new RID.

**Examples:**

```js
qbtable.add({thetext: 'abc'})
qbtable.add([
  {thetext: 'abc'},
  {thetext: 'def'},
  {thebool: true, thedate: new Date},
  {thetext: 'ghi', thebool: false, 17: 'fids work too'}
])
```

Update Method
-------------

```js
qbtable.update(obj)
qbtable.update(objs)
qbtable.update(rid, obj)
qbtable.update(rids, obj)
qbtable.update(query, obj)
```

The `update` method can be called with either one or two arguments. With one argument, it works the same as the `add` method, but you must specify the RID in each object. With two arguments, you either provide a single rid, an array of rids, or a query (see [above](#specifying-a-query)) to specify which records to update, and an object with the fields to update.

The Deferred returned by update is always resolved with `undefined`.

**Examples:**

```js
qbtable.update({3: 5, thetext: 'abc'})
qbtable.update([{3: 5, thetext: 'abc'},
                {3: 6, thetext: 'def'},
                {3: 7, thebool: true, thedate: 0}])
qbtable.update(5, {thetext: 'abc'})
qbtable.update([5, 6], {thetext: 'abc'})
qbtable.update({thebool: true}, {thetext: 'abc'})
```

Delete Method
-------------

```js
qbtable.delete(rid)
qbtable.delete(rids)
qbtable.delete(query)
```

The `delete` method takes a single argument, either a single rid, an array of rids, or a query (see [above](#specifying-a-query)) to specify which records to delete. As a precaution, you cannot use an empty string as a query to delete all records, but see the [deleteAll](#deleteall-method) method below.

The Deferred returned by `delete` is resolved with the number of records deleted. Note that `delete` does not fail when records don't exist. If this matters, check the value it resolves with.

**Examples:**

```js
qbtable.delete(5)
qbtable.delete([5, 6])
qbtable.delete({thebool: true})
```

DeleteAll Method
-------------

```js
qbtable.deleteAll()
```

The `deleteAll` method deletes all records from a table.

The Deferred returned by `deleteAll` is resolved with the number of records deleted.

Controlling Flow
----------------

Operations can be strung together using [`deferred.pipe`](http://api.jquery.com/deferred.pipe/). This allows you to write asynchronous code similar to synchronous code, but with extra noise:

```js
parent_table.query('', 3)
  .pipe(function (rids) {
    var objs = $.map(rids, function (rid) { return {rel_parent: rid} })
    return child_table.add(objs)
  })
  .pipe(function (rids) {
    var objs = $.map(rids, function (rid) { return {rel_parent: rid} })
    return grandchild_table.add(objs)
  })
  .pipe(function (rids) {
    return rids.length * 2
  })
  .pipe(function(numberCreated) {
    alert(numberCreated + " records created")
  })
```

This will create a child for every parent, and then a grandchild for every newly created child, then compute the number of created records, and finally inform the user of the number (The example is contrived, the last two steps could be combined). The `pipe` function takes a function that will be passed the resolved result of the Deferred. This function can then either return a new Deferred for the next operation to be piped onto, as the first two `pipe` calls above do passing along the Deferred from an `add` call, or it can return a value for the next operation, as above with `return rids.length * 2`.

Note that the jQuery docs say that `pipe` is deprecated in jQuery 1.8, and that you should use [`deferred.then`](http://api.jquery.com/deferred.then/) instead. However, Quickbase is still using 1.7.2, which has a different `then` method than 1.8+. For the time being, it is best to use `pipe` with QB Deferred.

QB Deferred includes a monkey-patch to the `pipe` method and in jQuery 1.8+ the `then` method to make throwing exceptions inside the functions passed to them safe. Throwing an exception will result in a rejected Deferred.

Here is a more complex example:

```js
var parentQuery = parent_table.query('', 3)
var branch1 = parentQuery
  .pipe(function (rids) {
    var objs = $.map(rids, function (rid) { return {rel_parent: rid} })
    return child_table1.add(objs)
  })
var branch2 = parentQuery
  .pipe(function (rids) {
    var objs = $.map(rids, function (rid) { return {rel_parent: rid} })
    return child_table2.add(objs)
  })
$.when(branch1, branch2)
  .pipe(function (rids1, rid2) {
    return rids1.length + rids2.length
  })
  .pipe(function(numberCreated) {
    alert(numberCreated + " records created")
  })
  .fail(function (err) {
    alert("Error: " + err)
  })
```

This will create a child for every parent in both `child_table1` and `child_table2`, with the two creation operations running concurrently. After they complete, we join the two lines of work back together, and report either success or failure to the user.

We store the Deferred representing the result of querying the parent table in `parentQuery`, then pipe both creation operations off of it. We store the Deferred objects representing the result of these two operations into `branch1` and `branch2`. The [`$.when`](http://api.jquery.com/jQuery.when/) function takes any number of Deferred objects, and returns a new Deferred object that resolves with the values of all the passed Deferred objects. Here, we use `$.when` to let us pipe new operations off of the results of both creation operations. The chain ends with a call to [`deferred.fail`](http://api.jquery.com/deferred.fail/). The function passed to `fail` is called only if the Deferred `fail` is called on is rejected. Because of the way `$.when` and `pipe` work, a failure happening anywhere in the chain that precedes `fail` will result in the function being called. In the example, if querying the parent table failed, none of the functions passed to `pipe` would execute, but the one passed to `fail` would still receive the error.

PostQB Method and adding new methods
------------------------------------

```js
table.postQB(api_method, xml)
```

If you need to use a Quickbase API method that QB Deferred doesn't already have a specialized method for, the postQB method will let you create a request to Quickbase for any API method along with XML you provide. The API method should be given as a string, e.g. `'API_DoQuery'`. The XML should also be provided as a string. QB Deferred will automatically include an `<apptoken>` element if needed and wrap the XML in a `<qdbapi>` element. You only need to provide the XML to put inside of the `<qdbapi>`.

QB Deferred will parse the incoming response from QB and check for any errors. If no errors occurred, it will resolve the Deferred with a JQuery object wrapping the XML. You can then use JQuery methods like [`find`](http://api.jquery.com/find/) to extract data from the XML.

You can add new methods to QBTable objects by adding them to the prototype. As an example, here is the definition of the `count` method:

```js
QBTable.prototype.count = function (query) {
  var data = '<query>' + this.makeQuery(query) + '</query>'
  return this.postQB('API_DoQueryCount', data).pipe(function (res) {
    return parseInt(res.find('numMatches').text())
  })
}
```

`makeQuery` is an internal method, it is used here to create the Quickbase query that we embed in the XML. The Deferred from postQB is piped to a function where the number of matching records is extracted from the response XML. This becomes the value that the Deferred returned by `count` resolves with.

Internals
---------

The `add` and `update` methods sort records by which fields are being set, and for each group attempt to do an ImportCSV call. If a record contains a value that cannot be set through ImportCSV, e.g. a value with both `,` and `"` characters in it, then AddRecord or EditRecord will be used for that record instead.

The `delete` method uses PurgeRecords to quickly delete large numbers of records. It will look for groups of sequential RIDs and delete them with queries using GTE and LTE. For the remainder, it deletes records in batches using OR. With a single record `delete` will use DeleteRecord.

The multiple HTTP requests from `add`, `update`, and `delete` are done concurrently.

License
-------

Copyright 2013-2014 Stephen Marsh

Licensed under the Apache License, Version 2.0 (the "License"); you may not use these files except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
