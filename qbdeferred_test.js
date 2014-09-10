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

function shouldFail(d) {
  return d.pipe(
    function () {
      throw new Error("Call suceeded when it should have failed")
    },
    function () {
      return $.rootDef()
    }
  )
}

function assert(b) {
  if (!b)
    throw new Error("Assertion failed")
}

function arraysEqual(arr1, arr2) {
  return $(arr1).not(arr2).length == 0 && $(arr2).not(arr1).length == 0
}

function runSetups(table, app) {
  var setups = getSetups(table, app)
  var successCount = 0
  var failCount = 0

  function succeedTest(name) {
    successCount++
    console.log("SUCCESS: " + name)
  }

  function failTest(name, err) {
    failCount++
    console.log("FAIL: " + name + ": " + err)
  }

  var bigD = $.rootDef()

  $.each(setups, function (i, setup) {
    var tests = setup.tests
    if (!$.isArray(tests[0]))
      tests = [tests]
    bigD = bigD.pipe(function () {
      var sd = table.deleteAll()
      if ('setup' in setup)
        sd = sd.pipe(setup.setup)
      sd = sd.pipe(
        function (fromSetup) {
          return $.traverse(tests, function (test) {
            var name = test[0]
            var td = $.safely(test[1])(fromSetup)
            if (test[2])
              td = shouldFail(td)
            td = td.pipe(
              function () {
                succeedTest(name)
              },
              function (err) {
                failTest(name, err)
                return $.rootDef()
              }
            )
            return td
          })
        },
        function (err) {
          $.each(tests, function (i, test) {
            failTest(test[0], "Error in setup: " + err)
          })
          return $.rootDef()
        }
      )
      return sd
    })
  })
  bigD.done(function () {
    console.log("All tests complete")
    console.log((successCount + failCount) + " tests run, " +
                successCount + " tests successful, " +
                failCount + " tests failed.")
    if (failCount == 0)
      console.log("All tests passed")
  }).fail(function (err) {
    console.log("ERROR: Something went wrong during testing: " + err)
  })
}

function getSetups(table, app) {
  return [
    // Query tests
    {
      setup: function () {
        return table.add([{thebool: true, thetext: 'qwe'},
                          {thebool: false, thetext: 'qwe'},
                          {thebool: false, thetext: 'asd'}])
      },
      tests: [
        ["query with query string",
         function () {
           return table.query("{3.GT.'0'}", 3).pipe(function (x) {
             assert(x.length == 3)
           })
         }
        ],
        ["query with simple structure",
         function () {
           return table.query({thetext: 'asd'}, 3).pipe(function (x) {
             assert(x.length == 1)
           })
         }
        ],
        ["query with complex structure",
         function () {
           return table.query({thetext: {xex: 'asd'}}, 3).pipe(function (x) {
             assert(x.length == 2)
           })
         }
        ],
        ["query with slist with desc",
         function () {
           return table.query('', 'thetext', {desc: 'thetext'}).pipe(function (x) {
             assert(x[0] == 'qwe')
           })
         }
        ],
        ["query with }",
         function () {
           return table.query({thetext: '}'})
         }, true
        ],
        ["query with skip",
         function () {
           return table.query('', 3, 3, {skip: 1}).pipe(function (x) {
             assert(x.length == 2)
           })
         }
        ],
        ["query with limit",
         function () {
           return table.query('', 3, 3, {limit: 2}).pipe(function (x) {
             assert(x.length == 2)
           })
         }
        ],
        ["query with nonexistent column should fail",
         function () {
           return table.query('', 1000)
         }, true
        ],
        ["count",
         function () {
           return table.count({thebool: false}).pipe(function (x) {
             assert(x == 2)
           })
         }
        ]
      ]
    },

    {
      tests: [
        ["add with one record and XML escaping",
         function () {
           var row = {thebool: true, thetext: 'a&b<c>d"e\'f'}
           return table.add(row)
             .pipe(function () {
               return table.query('', ['thebool', 'thetext'])
             })
             .pipe(function (x) {
               assert(x[0].thetext == row.thetext)
             })
         }
        ],
        ["getPage and setPage",
         function () {
           var str1 = '123abc'
           var str2 = ' \t a&b<c>d"e\'fXYZ\n\n'
           var pagename = 'qbdeftest.txt'
           return app.setPage(pagename, str1)
             .pipe(function (pageID) {
               return app.getPage(pageID)
                 .pipe(function (x) {
                   assert(x == str1)
                   return app.setPage(pageID, str2)
                 })
                 .pipe(function () {
                   return app.getPage(pagename)
                 })
                 .pipe(function (x) {
                   assert(x == str2)
                 })
             })
         }
        ]
      ]
    },

    {
      setup: function () {
        var rows = [
          {thetext: '"xxx'},
          {thetext: '""xyx'},
          {thetext: '"""xzx'},
          {thetext: 'yyy"'},
          {thetext: 'ww"ww'},
          {thetext: 'ww""ww'},
          {thetext: 'ww"""ww'},
          {thetext: 'aa,aa'},
          {thetext: 'bb,bb"'},
          {thetext: '"cc,cc'},
          {thetext: "dd\ndd"},
          {thetext: "ee\nee\""},
          {thetext: "\"ff\nff"},
          {thetext: "gg\rgg"},
          {thetext: "hh\rhh\""},
          {thetext: "\"ii\rii"},
          {thetext: " ss"},
          {thetext: "\ttt"},
          {thetext: "\nuu"},
          {thetext: "jj "},
          {thetext: "kk\t"},
          {thetext: "ll\n"},
          {thetext: 'nnn'},
          {thetext: 'ooo'},
          {thetext: 'ppp'},
          {thetext: 'zz]]>zz<zz'},
          {thetext: 'qqq', thebool: true},
          {thetext: 'rrr', thebool: false},
          {thebool: true}
        ]
        return table.add(rows)
          .pipe(function (rids) {
            return {rids: rids, rows: rows}
          })
      },
      tests: [
        ["add with multiple records, different columns, and RID return",
         function (fromSetup) {
           return table.query('', 3)
             .pipe(function (rids2) {
               assert(arraysEqual(fromSetup.rids, rids2))
             })
         }
        ],
        ["add with CSV poison",
         function (fromSetup) {
           return table.query('', 'thetext')
             .pipe(function (x) {
               var rowsText = $.map(fromSetup.rows, function (r) {
                 if (!('thetext' in r))
                   return ''
                 return r.thetext.replace(/\r(\n)?/g, "\n")
               })
               assert(arraysEqual(x, rowsText))
             })
         }
        ]
      ]
    },

    {
      tests: [
        ["update with one rid",
         function () {
           return table.add([{thetext: 'a1'},
                             {thetext: 'a1'}])
             .pipe(function (rids) {
               return table.update(rids[0], {thetext: 'a2'})
             })
             .pipe(function () {
               return table.query({thetext: 'a1'}, 3)
             })
             .pipe(function (x) {
               assert(x.length == 1)
             })
         }
        ],
        ["update with multiple rids",
         function () {
           return table.add([{thetext: 'd1'},
                             {thetext: 'd1'}])
             .pipe(function (rids) {
               return table.update(rids, {thetext: 'd2'})
             })
             .pipe(function () {
               return table.query({thetext: 'd2'}, 3)
             })
             .pipe(function (x) {
               assert(x.length == 2)
             })
         }
        ],
        ["update with one rid in object",
         function () {
           return table.add([{thetext: 'b1'},
                             {thetext: 'b1'}])
             .pipe(function (rids) {
               return table.update({3: rids[0], thetext: 'b2'})
             })
             .pipe(function () {
               return table.query({thetext: 'b1'}, 3)
             })
             .pipe(function (x) {
               assert(x.length == 1)
             })
         }
        ],
        ["update with rids in multiple objects",
         function () {
           return table.add([{thetext: 'c1'},
                             {thetext: 'c1'}])
             .pipe(function (rids) {
               return table.update([{3: rids[0], thetext: 'c2'},
                                    {3: rids[1], thetext: 'c2'}])
             })
             .pipe(function () {
               return table.query({thetext: 'c2'}, 3)
             })
             .pipe(function (x) {
               assert(x.length == 2)
             })
         }
        ],
        ["update with query",
         function () {
           return table.add([{thetext: 'e1', thebool: false},
                             {thetext: 'e1', thebool: true}])
             .pipe(function () {
               return table.update({thetext: 'e1', thebool: true},
                                   {thetext: 'e2'})
             })
             .pipe(function () {
               return table.query({thetext: 'e1'}, 3)
             })
             .pipe(function (x) {
               assert(x.length == 1)
             })
         }
        ],
        ["update with query with no matches",
         function () {
           return table.add([{thetext: 'f1', thebool: false},
                             {thetext: 'f1', thebool: true}])
             .pipe(function () {
               return table.update({thetext: 'ffff1'},
                                   {thetext: 'f2'})
             })
             .pipe(function () {
               return table.query({thetext: 'f2'}, 3)
             })
             .pipe(function (x) {
               assert(x.length == 0)
             })
         }
        ],
        ["DateTime autoconversion, inConverter, and outConverter",
         function () {
           var date = new Date
           var dur = 3 * 3600 * 1000
           return table.add([{thetext: 'g', thedate: date, theduration: dur, thenumeric: 123}])
             .pipe(function () {
               return table.query({thetext: 'g'}, ['thedate', 'theduration', 'thenumeric'])
             })
             .pipe(function (x) {
               x = x[0]
               assert(x.thedate.getTime() == date.getTime())
               assert(x.theduration == dur)
               assert(x.thenumeric === 123)
             })
         }
        ],
        ["Conversion with single column",
         function () {
           return table.add([{thetext: 'h', thenumeric: 123}])
             .pipe(function () {
               return table.query({thetext: 'h'}, 'thenumeric')
             })
             .pipe(function (x) {
               assert(x[0] === 123)
             })
         }
        ]
      ]
    },

    {
      setup: function () {
        var objs = []
        for (var i = 0; i < 33; i++) {
          objs.push({thetext: i})
        }
        return table.add(objs)
      },
      tests: [
        ["delete with GTE and LTE",
         function (addRids) {
           var keep = ['20', '31']
           var rids = []
           for (var i = 0; i < 33; i++) {
             if ($.inArray(i.toString(), keep) == -1) {
               rids.push(addRids[i])
             }
           }
           return table.delete(rids)
             .pipe(function (x) {
               assert(x == 31)
               return table.query('', 'thetext')
             })
             .pipe(function (x) {
               assert(arraysEqual(keep, x))
             })
         }
        ],
        ["delete with []",
         function () {
           return table.delete([])
             .pipe(function (x) {
               assert(x == 0)
               return table.query('', 3)
             })
             .pipe(function (x) {
               assert(x.length != 0)
             })
         }
        ]
      ]
    },

    {
      tests: [
        ["delete with one rid",
         function () {
           return table.add([{thetext: 'a'},
                             {thetext: 'a'}])
             .pipe(function (rids) {
               return table.delete(rids[0])
             })
             .pipe(function () {
               return table.query({thetext: 'a'}, 3)
             })
             .pipe(function (x) {
               assert(x.length == 1)
             })
         }
        ],
        ["delete with multiple rids",
         function () {
           return table.add([{thetext: 'b'},
                             {thetext: 'b'},
                             {thetext: 'b'},
                             {thetext: 'b'}])
             .pipe(function (rids) {
               return table.delete(rids.slice(2))
             })
             .pipe(function () {
               return table.query({thetext: 'b'}, 3)
             })
             .pipe(function (x) {
               assert(x.length == 2)
             })
         }
        ],
        ["delete with query",
         function () {
           return table.add([{thetext: 'c', thebool: true},
                             {thetext: 'c', thebool: false}])
             .pipe(function (rids) {
               return table.delete({thetext: 'c', thebool: true})
             })
             .pipe(function () {
               return table.query({thetext: 'c'}, 3)
             })
             .pipe(function (x) {
               assert(x.length == 1)
             })
         }
        ],
        ["delete with '' should fail",
         function () {
           return table.delete('')
         }, true
        ],
        ["delete with 1000000",
         function () {
           return table.delete(1000000)
             .pipe(function (x) {
               assert(x == 0)
             })
         }
        ]
      ]
    },
    {
      tests: [
        "deleteAll",
        function () {
          return table.add([{thetext: 'q'},
                            {thetext: 'q'}])
            .pipe(function () {
              return table.deleteAll()
            })
            .pipe(function () {
              return table.query('', 3)
            })
            .pipe(function (x) {
              assert(x.length == 0)
            })
        }
      ]
    }
  ]
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runSetups: runSetups
  }
}
