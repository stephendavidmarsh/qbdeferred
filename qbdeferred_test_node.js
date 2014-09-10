/*

Copyright 2013-2014 Stephen Marsh

Licensed under the Apache License, Version 2.0 (the "License"); you
may not use this file except in compliance with the License. You may
obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
implied. See the License for the specific language governing
permissions and limitations under the License.

*/

var qbdef = require('./qbdeferred.js')
var qbdef_test = require('./qbdeferred_test.js')

var password = process.env.QB_PASSWD
if (!password)
  throw new Error('You must set QB_PASSWD to an appropriate Quickbase password')

/*

You must provide a QB application in order to run these tests

*/

var domain = new QBDomain(
  'QUICKBASE_DOMAIN_HERE',
  'USERNAME_HERE',
  password
)

var app = domain.qbApp(
  'DBID_HERE'
  //, 'APPTOKEN_HERE' // Uncomment if needed
)

/*

You must create a QB table in order to run these tests
Create these fields, preferably in order
thebool, a checkbox field
thedate, a datetime field
thetext, a text field
theduration, a duration field with Value display set to hours

Put the DBID and FIDs into the call to qbTable below

*/

var table = app.qbTable(
  'DBID_HERE', {
    thebool: 6,
    thedate: {date: 7},
    thetext: 8,
    theduration: {fid: 9, outConverter: function (x) { return x / 1000 / 3600 }},
    thenumeric: {numeric: 10},
    thedatecorrected: {dateCorrectTimezone: 11}
  }
)

qbdef_test.runSetups(table, app)
