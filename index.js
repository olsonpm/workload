'use strict'

var util = require('util')
var EventEmitter = require('events').EventEmitter
var xtend = require('xtend')
var request = require('request')
var weighted = require('weighted')
var maybe = require('mostly-working-hours')
var expand = require('brace-expansion')
var weekend = require('is-it-weekend')
var _mean = require('lodash/mean')
var pkg = require('./package')

var USER_AGENT = pkg.name + '/' + pkg.version

module.exports = Workload

function Workload (opts) {
  if (!(this instanceof Workload)) return new Workload(opts)

  EventEmitter.call(this)

  var self = this
  var interval = Math.round(1000 / ((opts.max || 12) / 60)) // default to max 12 requests per minute
  var filters = opts.filters || [opts.filter || function (_, cb) { cb() }]
  this._defaultHeaders = opts.headers
  this._responseTimes = []

  var weights = opts.requests.map(function (req) {
    return req.weight || 1
  })

  this._timer = setInterval(function () {
    var req = xtend({ _start: Date.now() }, weighted.select(opts.requests, weights))
    iterator(req)
  }, interval)

  function iterator (req, n) {
    if (!n) n = 0
    var filter = filters[n]
    if (!filter) return self._visit(req)
    filter(req, function (modified) {
      iterator(modified || req, ++n)
    })
  }
}

util.inherits(Workload, EventEmitter)

Workload.stdFilters = {
  workdays: function (req, cb) {
    var odds = weekend() ? 0.2 : 1
    if (Math.random() <= odds) cb()
  },
  workingHours: function (req, cb) {
    maybe(cb)
  },
  expand: function (req, cb) {
    var urls = expand(req.url)
    req.url = urls[Math.round(Math.random() * (urls.length - 1))]
    cb()
  }
}

Workload.prototype.stop = function stop () {
  clearInterval(this._timer)

  return { avgResponseTime: _mean(this._responseTimes) };
}

Workload.prototype._visit = function _visit (req) {
  var self = this

  req.headers = xtend({'user-agent': USER_AGENT}, this._defaultHeaders, req.headers)

  request(req, function (err, res, body) {
    self._responseTimes.push(Date.now() - req._start);
    if (err) return self.emit('error', err)
    self.emit('visit', {
      request: req,
      response: res,
      body: body
    })
  })
}
