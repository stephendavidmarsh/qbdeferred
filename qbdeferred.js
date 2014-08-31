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

// Detect if we are in NodeJS
// If so, require jQuery and all its dependencies
var qbDefIsNode = false
if (typeof module !== 'undefined' && module.exports) {
  qbDefIsNode = true
  var jsdom = require('jsdom').jsdom
  var fakeWindow = jsdom('<html><body></body></html>').parentWindow
  var $ = require('jquery')(fakeWindow)
  root.XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest
  $.support.cors = true;
  root.DOMParser = require('xmldom').DOMParser
}

// Helper methods put into jQuery object
$.safely = function (f) {
  return function () {
    try {
      return f.apply(this, arguments)
    } catch (err) {
      return (new $.Deferred).reject(err)
    }
  }
}

$.traverse = function (arr, f) {
  return $.when.apply($, $.map(arr, f))
    .pipe(function () {
      return arguments
    })
}

// Hack to make JQuery's deferred.pipe and in 1.8+ deferred.then
// methods handle exceptions correctly
$.origDeferred = $.Deferred
$.Deferred = (function () {
  var hasOldThen = /1\.(5|6|7)\./.test($.fn.jquery)

  function patch(d) {
    d.origPipe = hasOldThen ? d.pipe : d.then
    d.pipe = function (done, fail, progress) {
      if (done)
        done = $.safely(done)
      if (fail)
        fail = $.safely(fail)
      return this.origPipe(done, fail, progress)
    }
    if (!hasOldThen)
      d.then = d.pipe
  }

  return function () {
    var d = $.origDeferred.apply($, arguments)
    patch(d)
    d.origPromise = d.promise
    d.promise = function (obj) {
      var p = this.origPromise(obj)
      patch(p)
      return p
    }
    return d
  }
})()

// This returns a Deferred that is already resolved
$.rootDef = (function () {
  var rootDef = $.Deferred().resolve().promise()
  return function () { return rootDef }
})()

// QBDB
// QBDB generalizes Quickbase applications and tables
// It is the superclass of QBDomain, QBApp, and QBTable
function QBDB() {
}

QBDB.prototype.escapeXML = function (s) {
  return (
    s.replace(/&/g, '&amp;')
     .replace(/</g, '&lt;')
     .replace(/>/g, '&gt;')
     .replace(/"/g, '&quot;')
  )
}

// QBDomain
function QBDomain(domainName, username, password, hours) {
  if (!(this instanceof QBDomain))
    return new QBDomain(domain, username, password, hours)
  this.domainName = domainName
  if (username && password) {
    var data = '<username>' + username + '</username>'
    data += '<password>' + password + '</password>'
    if (hours)
      data += '<hours>' + hours + '</hours>'

    var self = this
    function authenticate() {
      return self._postQB('API_Authenticate', data)
        .pipe(function (res) {
          return res.find('ticket').text()
        })
    }

    this.authDef = authenticate()
    var goodFor = (hours ? hours : 12) * 3600 * 1000
    goodFor -= 5 * 60 * 1000 // Safety factor of five minutes
    var timer = setInterval(function () {
      var newAuthDef = authenticate()
      newAuthDef.always(function () {
        self.authDef = newAuthDef
      })
    }, goodFor)
    if (qbDefIsNode)
      timer.unref()
  } else this.authDef = $.rootDef()
}
QBDomain.prototype = new QBDB()

QBDomain.prototype._postQB = function (action, data, dbid) {
  if (!dbid)
      dbid = 'main'
  var url = '/db/' + dbid
  if (this.domainName)
    url = 'https://' + this.domainName + url
  return $.ajax(url, {
    type: 'POST',
    contentType: 'application/xml',
    headers: {'QUICKBASE-ACTION': action},
    data: '<qdbapi>' + data + '</qdbapi>'
  }).pipe(function (res) {
    res = $(res)
    var errcode = res.find('errcode').text()
    if (errcode != 0) {
      var errtext = res.find('errtext').text()
      var errdetail = res.find('errdetail').text()
      var err = new Error('QB Error: ' + errtext)
      err.qbErrcode = errcode
      err.qbErrtext = errtext
      err.qbErrdetail = errdetail
      throw err
    }
    return res
  })
}

QBDomain.prototype.postQB = function (action, data, dbid) {
  var self = this
  return this.authDef.pipe(function (ticket) {
    if (ticket)
      data = '<ticket>' + ticket + '</ticket>' + data
    return self._postQB(action, data, dbid)
  })
}

QBDomain.prototype.qbApp = function (dbid, apptoken) {
  return new QBApp(dbid, apptoken, this)
}

// QBApp
function QBApp(dbid, apptoken, domain) {
  if (!(this instanceof QBApp))
    return new QBApp(dbid, apptoken, domain)
  if (!domain)
    domain = defQBLibraryGlobal.domain
  this.domain = domain
  if (!apptoken && defQBLibraryGlobal.application)
    apptoken = defQBLibraryGlobal.application.apptoken
  this.apptoken = apptoken
  this.dbid = dbid
}
QBApp.prototype = new QBDB()

QBApp.prototype.postQB = function (action, data, dbid) {
  if (!dbid)
    dbid = this.dbid
  if (this.apptoken)
      data = '<apptoken>' + this.apptoken + '</apptoken>' + data
  return this.domain.postQB(action, data, dbid)
}

QBApp.prototype.dbidFor = function (alias) {
  var self = this
  if (!this.alias2DBIDMap) {
    function makeMap(dbid) {
      return self.postQB('API_GetSchema', '', dbid)
        .pipe(function (res) {
          var appDBID = res.find('app_id').text()
          if (appDBID != dbid)
            return makeMap(appDBID)
          var map = {}
          res.find('chdbid').each(function (i, r) {
            r = $(r)
            map[r.attr('name')] = r.text()
          })
          return map
        })
    }
    this.alias2DBIDMap = makeMap(
      this.dbid ? this.dbid : /\/db\/([^?]+)/.exec(window.location.href)[1]
    )
  }
  return this.alias2DBIDMap.pipe(function (map) {
    var dbid = map[alias]
    if (!dbid)
      throw new Error("Alias " + alias + " not found in application schema")
    return dbid
  })
}

QBApp.prototype.qbTable = function (dbid, fields) {
  return new QBTable(dbid, fields, this)
}

// Setup for global domain and application
var defQBLibraryGlobal = {
  domain: new QBDomain()
}
defQBLibraryGlobal.application = new QBApp()
function setQBApptoken(token) {
  defQBLibraryGlobal.application.apptoken = token
}

// QBTable
function QBTable(dbid, fields, application) {
  if (!(this instanceof QBTable))
    return new QBTable(dbid, fields)
  var _fields = {}
  for (name in fields) {
    if (fields.hasOwnProperty(name)) {
      var field = fields[name]
      var fid
      if (typeof field === 'object') {
        if ('fid' in field) {
          fid = field.fid
          field.name = name
        } else if ('date' in field) {
          fid = field.date
          field = {fid: fid, name: name,
                   inConverter: function (x) { return new Date(parseInt(x)) }}
        } else if ('numeric' in field) {
          fid = field.numeric
          field = {fid: fid, name: name,
                   inConverter: function (x) { return parseFloat(x) }
                  }
        } else throw new Error('Bad specification for field "' + name + '"')
      } else if (!isNaN(field)) {
        fid = field
        field = {fid: fid, name: name}
      } else throw new Error('Bad specification for field "' + name + '"')
      _fields[fid] = field
      _fields[name] = field
    }
  }
  this.fields = _fields
  if (!application)
    application = defQBLibraryGlobal.application
  this.dbid = (dbid.toLowerCase().lastIndexOf('_dbid_', 0) == 0)
    ? application.dbidFor(dbid.toLowerCase()) : $.Deferred().resolve(dbid)
  this.application = application
  this.domain = application.domain
}
QBTable.prototype = new QBDB()

QBTable.prototype.postQB = function (action, data) {
  var self = this
  return this.dbid.pipe(function (dbid) {
    return self.application.postQB(action, data, dbid)
  })
}

QBTable.prototype.resolveColumn = function (col) {
  if (isNaN(col)) {
    if (col in this.fields)
      return this.fields[col].fid
    else
      throw new Error('Unrecognized field name: ' + col)
  } else {
    return col
  }
}

QBTable.prototype.resolveColumns = function (cols) {
  var self = this
  return $.map(cols, function (c) {
    return self.resolveColumn(c)
  })
}

QBTable.prototype.makeQuery = function (query) {
  if (typeof query === 'object') {
    ret = []
    for (field in query) {
      var cons = query[field]
      field = this.resolveColumn(field)
      if (typeof cons === 'object' && !(cons instanceof Date)) {
        for (comp in cons) {
          if (cons.hasOwnProperty(comp)) {
            var value = this.prepareQueryValue(field, cons[comp])
            ret.push("{" + field + "." + comp.toUpperCase() + ".'" + value + "'}")
          }
        }
      } else {
        ret.push("{" + field + ".EX.'" + this.prepareQueryValue(field, cons) + "'}")
      }
    }
    query = ret.join('AND')
  }
  return this.escapeXML(query)
}

QBTable.prototype.prepareQueryValue = function (field, o) {
  var s = this.prepareValue(field, o)
  if (typeof s === 'string' && s.indexOf('}') != -1)
    throw new Error('Query value containing }')
  if (s == 'OR')
    throw new Error('Query value is OR')
  return s
}

QBTable.prototype.query = function (query, clist, slist, options) {
  var self = this
  var _options = []
  var data = '<fmt>structured</fmt><returnpercentage>1</returnpercentage>'

  if (query)
    data += '<query>' + this.makeQuery(query) + '</query>'

  if (!clist)
    throw new Error('query called without a clist')
  var singleColumn = false
  if ($.isArray(clist)) {
    data += '<clist>' + this.resolveColumns(clist).join('.') + '</clist>'
  } else {
    singleColumn = this.resolveColumn(clist)
    data += '<clist>' + singleColumn + '</clist>'
  }

  if (slist) {
    if (!$.isArray(slist))
      slist = [slist]
    var dotlist = []
    var adlist = ''
    var descPresent = false
    $.each(slist, function (i, col) {
      if (typeof col === 'object') {
        if ('desc' in col) {
          descPresent = true
          adlist += 'D'
          dotlist.push(self.resolveColumn(col.desc))
        } else throw new Error('Bad sort list specification')
      } else {
        adlist += 'A'
        dotlist.push(self.resolveColumn(col))
      }
    })
      data += '<slist>' + dotlist.join('.') + '</slist>'
    if (descPresent)
      _options.push('sortorder-' + adlist)
  }

  for (op in options) {
    if (options.hasOwnProperty(op)) {
      var mapping = {limit: 'num', skip: 'skp'}
      if (op in mapping) {
        _options.push(mapping[op] + '-' + options[op])
      } else throw new Error('Bad option specified: ' + op)
    }
  }
  if (_options.length != 0)
    data += '<options>' + _options.join('.') + '</options>'

  return this.postQB('API_DoQuery', data).pipe(function (res) {
    if (singleColumn) {
      if (singleColumn in self.fields)
        var inConverter = self.fields[singleColumn].inConverter
      return res.find('f').map(function () {
        var value = $(this).text()
        if (inConverter)
          value = inConverter(value)
        return value
      }).get()
    } else {
      return res.find('record').map(function () {
        var ret = {}
        $(this).find('f').each(function () {
          var f = $(this)
          var fid = f.attr('id')
          var value = f.text()
          if (fid in self.fields) {
            var inConverter = self.fields[fid].inConverter
            if (inConverter)
              value = inConverter(value)
            ret[self.fields[fid].name] = value
          }
          ret[fid] = value
        })
        return ret
      }).get()
    }
  })
}

QBTable.prototype.count = function (query) {
  var data = '<query>' + this.makeQuery(query) + '</query>'
  return this.postQB('API_DoQueryCount', data).pipe(function (res) {
    return parseInt(res.find('numMatches').text())
  })
}

QBTable.prototype.add = function (objs) { return this.addOrUpdate(objs, true) }

QBTable.prototype.update = function (param1, param2) {
  if (arguments.length == 1)
    return this.addOrUpdate(param1, false)

  // form with one or more rids and object separately
  if($.isArray(param1)) {
    var objs = $.map(param1, function (x) {
      var obj = $.extend({}, param2)
      obj[3] = x
      return obj
    })
    return this.addOrUpdate(objs, false)
  }
  // form with one rid not in an array and object separately
  if(!isNaN(param1))
    return this.update([param1], param2)

  // form with query
  var self = this
  return this.query(param1, 3).pipe(function (rids) {
    return self.update(rids, param2)
  })
}

QBTable.prototype.addOrUpdate = function (objs, isAdd) {
  var wasArray = true
  if (!$.isArray(objs)) {
    wasArray = false
    objs = [objs]
  }

  // Normalize columns to FIDs, and sort rows into rowSets based
  // on which columns are being updated. We also store a position for
  // each object so we can later collect new RIDs in the correct order
  var rowSets = this.makeRowSets(objs)

  var defs = []

  // Go through the rowSets and create ImportCSV calls
  // some rows are instead set aside for add/editRecord
  var nonCSVRows = []
  for (rsKey in rowSets) {
    if (rowSets.hasOwnProperty(rsKey)) {
      var rows = rowSets[rsKey]
      if (rows.length == 1) {
        nonCSVRows.push(rows[0])
      } else {
        var res = this.makeImportCSV(isAdd, rsKey, rows)
        nonCSVRows = nonCSVRows.concat(res.nonCSVRows)
        if (res.d)
          defs.push(res.d)
      }
    }
  }

  // make add/editRecord call for nonCSVRows
  var self = this
  $.each(nonCSVRows, function (i, row) {
    defs.push(self.makeAddEdit(isAdd, row))
  })

  // build the Deferred that we return
  // we need to do some work in the isAdd case to collect all the new rids
  var d = $.when.apply($, defs)
  return d.pipe(function () {
    if (isAdd) {
      var rids = []
      $.each(arguments, function (i, x) {
        $.each(x, function (i, r) {
          rids[r.position] = r.rid
        })
      })
      return wasArray ? rids : rids[0]
    }
  })
}

QBTable.prototype.makeRowSets = function (objs) {
  var self = this
  var rowSets = {}
  $.each(objs, function (index, obj) {
    var data = {}
    var keys = []
    for (key in obj) {
      if (obj.hasOwnProperty(key)) {
        var value = obj[key]
        key = self.resolveColumn(key)
        keys.push(key)
        data[key] = self.prepareValue(key, value)
      }
    }
    var rsKey = keys.sort().join('.')
    if (!(rsKey in rowSets))
      rowSets[rsKey] = []
    rowSets[rsKey].push({data: data, position: index})
  })
  return rowSets
}

// Called before a value is sent to QB
// Converts everything to a string
QBTable.prototype.prepareValue = function (field, value) {
  var name = field
  if (field in this.fields) {
    var fieldObj = this.fields[field]
    name = fieldObj.name
    var outConverter = fieldObj.outConverter
    if (outConverter)
      value = outConverter(value)
  }
  if (value instanceof Date)
    return value.getTime()
  if (typeof value === 'string' ||
      typeof value === 'number')
    return value
  if (typeof value === 'boolean')
    return value ? 1 : 0
  throw new Error('Bad value to send to QB for field "' + name + '": ' + value)
}

// Turns an object into a single CSV line
// Returns false if it can't be made into a CSV line because of
// contained commas or quotes.
QBTable.prototype.makeCSV = function (cols, obj) {
  var csv = []
  for (var i = 0; i < cols.length; i++) {
    var key = cols[i]
    var value = obj[key]
    if (typeof value === 'string') {
      if (/^\s/.test(value) ||
          /\s$/.test(value))
        return false
      if (value.charAt(0) == '"' ||
          value.indexOf(',') != -1 ||
          value.indexOf("\n") != -1 ||
          value.indexOf("\r") != -1) {
        value = value.replace(/"/g, '""')
        value = '"' + value + '"'
      }
    }
    csv.push(value)
  }
  return csv.join(',')
}

QBTable.prototype.makeImportCSV = function (isAdd, rsKey, rows) {
  var self = this
  var csv = ''
  var nonCSVRows = []
  var positions = []
  var cols = rsKey.split('.')
  $.each(rows, function (index, row) {
    var obj = row.data
    var csvRow = self.makeCSV(cols, obj)
    if (!csvRow)
      nonCSVRows.push(row)
    else {
      positions.push(row.position)
      csv += csvRow + "\n"
    }
  })
  var d = false
  if (csv) {
    csv = csv.replace(/\]\]>/g, ']]>]]&gt;<![CDATA[')
    var data = "<records_csv><![CDATA[" + csv + "]]></records_csv>"
    data += '<clist>' + rsKey + '</clist><msInUTC>1</msInUTC>'
    d = this.postQB('API_ImportFromCSV', data)
    if (isAdd) {
      d = d.pipe(function (res) {
        return res.find('rid').map(function (i, r) {
          return {rid: $(r).text(), position: positions[i]}
        }).get()
      })
    }
  }
  return {d: d, nonCSVRows: nonCSVRows}
}

QBTable.prototype.makeAddEdit = function (isAdd, row) {
  var obj = row.data
  var data = '<msInUTC>1</msInUTC>'
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      var value = obj[key]
      if (typeof value === 'string')
        value = this.escapeXML(value)
      if (key == 3 && !isAdd)
        data += '<rid>' + value + '</rid>'
      else
        data += '<field fid="' + key + '">' + value + '</field>'
    }
  }
  var d = this.postQB(isAdd ? 'API_AddRecord' : 'API_EditRecord', data)
  if (isAdd) {
    d = d.pipe(function (res) {
      return [{rid: res.find('rid').text(), position: row.position}]
    })
  }
  return d
}

QBTable.prototype.delete = function (param) {
  // this guard is so that an accidental '' or undefined doesn't wipe
  // out an entire table
  if (!param)
    throw new Error('delete called without a valid query or rids')
  if($.isArray(param)) {
    var atOnce = 10
    var defs = []
    param = param.sort()
    var group = []
    var last = param[0] - 1
    var leftOvers = []

    var self = this
    function handleGroup() {
      if (group.length > atOnce) {
        var query = "{3.GTE.'" + group[0] +
          "'}AND{3.LTE.'" + group[group.length - 1] + "'}"
        defs.push(self.makePurge(query))
      } else {
        leftOvers = leftOvers.concat(group)
      }
    }

    for (var i = 0; i < param.length; i++) {
      var rid = parseInt(param[i])
      if (rid == last + 1)
        group.push(rid)
      else {
        handleGroup()
        group = [rid]
      }
      last = rid
    }
    handleGroup()

    for (var i = 0; i < leftOvers.length; i += atOnce) {
      group = leftOvers.slice(i, i + atOnce)
      if (group.length == 1) {
        defs.push(
          this.postQB('API_DeleteRecord', '<rid>' + group[0] + '</rid>')
            .pipe(function (res) {
              return 1
            }, function (err) {
              if (err.qbErrcode == 30)
                return $.Deferred().resolve(0)
              return err
            })
        )
      } else {
        var query = "{3.EX.'" + group.join(' OR ') + "'}"
        defs.push(this.makePurge(query))
      }
    }
    return $.when.apply($, defs)
      .pipe(function() {
        var sum = 0
        $.each(arguments, function (i, x) {
          sum += x
        })
        return sum
      })
  }
  // form with one rid not in an array
  if(!isNaN(param))
    return this.delete([param])

  // form with query
  return this.makePurge(this.makeQuery(param))
}

QBTable.prototype.deleteAll = function () {
  return this.makePurge()
}

QBTable.prototype.makePurge = function (query) {
  var data = query ? '<query>' + query + '</query>' : ''
  return this.postQB('API_PurgeRecords', data)
    .pipe(function (res) {
      return parseInt(res.find('num_records_deleted').text())
    })
}

if (qbDefIsNode) {
  module.exports = {
    QBDomain: QBDomain,
    $: $
  }
  root.QBDomain = QBDomain
  if (!root.$)
    root.$ = $
}
