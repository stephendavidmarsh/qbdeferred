/*

Copyright 2013 Stephen Marsh

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
}

// QB specific stuff not part of QBTable
defQBLibraryGlobal = {}
function setQBApptoken(token) {
  defQBLibraryGlobal.apptoken = token
}

// QBTable
function QBTable(dbid, fields) {
  this.dbid = dbid
  var _fields = {}
  for (name in fields) {
    var field = fields[name]
    var fid
    if (isNaN(field)) {
      fid = field.fid
      field.name = name
    } else {
      fid = field
      field = {fid: fid, name: name}
    }
    _fields[fid] = field
    _fields[name] = field
  }
  this.fields = _fields
}

QBTable.prototype.escapeXML = function(s) {
  return (
    s.replace(/&/g, '&amp;')
     .replace(/</g, '&lt;')
     .replace(/>/g, '&gt;')
     .replace(/"/g, '&quot;')
  )
}

QBTable.prototype.postQB = function (action, data) {
  var apptoken = ('apptoken' in defQBLibraryGlobal) ?
    '<apptoken>' + defQBLibraryGlobal.apptoken + '</apptoken>' : ''
  return $.ajax('/db/' + this.dbid, {
    type: 'POST',
    contentType: 'application/xml',
    headers: {'QUICKBASE-ACTION': action},
    data: '<qdbapi>' + apptoken + data + '</qdbapi>'
  }).pipe($.safely(function (res) {
    res = $(res)
    if (res.find('errcode').text() != 0)
      throw 'QB Error: ' + res.find('errtext').text()
    return res
  }))
}

QBTable.prototype.resolveColumn = function (col) {
  if (isNaN(col)) {
    if (col in this.fields)
      return this.fields[col].fid
    else
      throw "Unrecognized field name: " + col
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
      if (typeof cons === 'object') {
        for (comp in cons) {
          if (cons.hasOwnProperty(comp)) {
            var value = this.prepareQueryValue(cons[comp])
            ret.push("{" + field + "." + comp.toUpperCase() + ".'" + value + "'}")
          }
        }
      } else {
        ret.push("{" + field + ".EX.'" + this.prepareQueryValue(cons) + "'}")
      }
    }
    query = ret.join('AND')
  }
  return this.escapeXML(query)
}

QBTable.prototype.prepareQueryValue = function (o) {
  var s = this.prepareValue(o)
  if (s.indexOf('}') != -1)
    throw "Query value containing }"
  if (s == 'OR')
    throw "Query value is OR"
  return s
}

QBTable.prototype.query = function (query, clist, slist, options) {
  var self = this
  var _options = []
  var data = '<fmt>structured</fmt>'

  if (query)
    data += '<query>' + this.makeQuery(query) + '</query>'

  if (!clist)
    throw "query called without a clist"
  var singleColumn = false
  if ($.isArray(clist)) {
    data += '<clist>' + this.resolveColumns(clist).join('.') + '</clist>'
  } else {
    singleColumn = true
    data += '<clist>' + this.resolveColumn(clist) + '</clist>'
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
        } else throw "Bad sort list specification"
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
      } else throw "Bad option specified: " + op
    }
  }
  if (_options.length != 0)
    data += '<options>' + _options.join('.') + '</options>'

  return this.postQB('API_DoQuery', data).pipe($.safely(function (res) {
    if (singleColumn) {
      return $(res).find('f').map(function () { return $(this).text() }).get()
    } else {
      return $(res).find('record').map(function () {
        var ret = {}
        $(this).find('f').each(function () {
          var f = $(this)
          var fid = f.attr('id')
          var value = f.text()
          ret[fid] = value
          if (fid in self.fields)
            ret[self.fields[fid].name] = value
        })
        return ret
      }).get()
    }
  }))
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
  return this.query(param1, 3).pipe($.safely(function (rids) {
    return self.update(rids, param2)
  }))
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
    } else return true
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
        data[key] = self.prepareValue(value)
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
QBTable.prototype.prepareValue = function (value) {
  if (value instanceof Date)
    value = value.getTime()
  return value.toString()
}

// Turns an object into a single CSV line
// Returns false if it can't be made into a CSV line because of
// contained commas or quotes.
QBTable.prototype.makeCSV = function (cols, obj) {
  var csv = []
  for (var i = 0; i < cols.length; i++) {
    var key = cols[i]
    var value = obj[key]
    if (value.charAt(0) == '"')
      return false
    if (value.indexOf(',') != -1) {
      if (value.indexOf('"') != -1)
        return false
      value = '"' + value + '"'
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
    var data = "<records_csv>\n<![CDATA[\n" + csv + "]]>\n</records_csv>"
    data += '<clist>' + rsKey + '</clist><msInUTC>1</msInUTC>'
    d = this.postQB('API_ImportFromCSV', data)
    if (isAdd) {
      d = d.pipe($.safely(function (res) {
        return $(res).find('rid').map(function (i, r) {
          return {rid: $(r).text(), position: positions[i]}
        }).get()
      }))
    }
  }
  return {d: d, nonCSVRows: nonCSVRows}
}

QBTable.prototype.makeAddEdit = function (isAdd, row) {
  var obj = row.data
  var data = '<msInUTC>1</msInUTC>'
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      if (key == 3 && !isAdd)
        data += '<rid>' + obj[key] + '</rid>'
      else
        data += '<field fid="' + key + '">' + this.escapeXML(obj[key]) + '</field>'
    }
  }
  var d = this.postQB(isAdd ? 'API_AddRecord' : 'API_EditRecord', data)
  if (isAdd) {
    d = d.pipe($.safely(function (res) {
      return [{rid: $(res).find('rid').text(), position: row.position}]
    }))
  }
  return d
}

QBTable.prototype.delete = function (param) {
  // this guard is so that an accidental '' or undefined doesn't wipe
  // out an entire table
  if (!param)
    throw "delete called without a valid query or rids"

  if($.isArray(param)) {
    if (param == []) {
      return (new $.Deferred).resolve()
    }
    if (param.length == 1)
      return this.postQB('API_DeleteRecord', '<rid>' + param + '</rid>')
    var atOnce = 10
    var defs = []
    for (var i = 0; i < param.length; i += atOnce) {
      var query = "{3.EX.'" + param.slice(i, i + atOnce).join(' OR ') + "'}"
      defs.push(this.makePurge(query))
    }
    return $.when.apply($, defs)
  }
  // form with one rid not in an array
  if(!isNaN(param))
    return this.delete([param])

  // form with query
  return this.makePurge(this.makeQuery(param))
}

QBTable.prototype.makePurge = function (query) {
  var data = '<query>' + query + '</query>'
  return this.postQB('API_PurgeRecords', data)
}

QBTable.prototype.deleteAll = function () {
  return this.postQB('API_PurgeRecords', '')
}
