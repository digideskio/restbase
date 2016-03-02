"use strict";

var P = require('bluebird');
var uuid = require('cassandra-uuid').TimeUuid;
var preq = require('preq');

var HyperSwitch = require('hyperswitch');
var URI = HyperSwitch.URI;

var spec = HyperSwitch.utils.loadSpec(__dirname + '/key_rev_value.yaml');

function ArchivalBucket(options) {
}

ArchivalBucket.prototype._latestName = function(bucket) {
    return bucket + '.latest';
};

ArchivalBucket.prototype._archiveName = function(bucket) {
    return bucket;
};

ArchivalBucket.prototype.createBucket = function(hyper, req) {
    var self = this;
    var rp = req.params;
    return P.join(
        hyper.put({
            uri: new URI([rp.domain, 'sys', 'key_rev_value', self._latestName(rp.bucket)]),
            headers: req.headers,
            body: Object.assign({}, req.body, { revisionRetentionPolicy: { type: 'latest_hash' } })
        }),
        hyper.put({
            uri: new URI([rp.domain, 'sys', 'key_rev_value', self._archiveName(rp.bucket)]),
            headers: req.headers,
            body: req.body
        })
    )
    .then(function() {
        return { status: 201 }; });
};

function requestURI(rp, bucket) {
    var requestPath = [rp.domain, 'sys', 'key_rev_value', bucket, rp.key];
    if (rp.revision) {
        requestPath.push('' + rp.revision);
        if (rp.tid) {
            requestPath.push(rp.tid);
        }
    }
    return new URI(requestPath);
}

ArchivalBucket.prototype.getRevision = function(hyper, req) {
    var self = this;
    var rp = req.params;
    return hyper.get({
        uri: requestURI(rp, self._latestName(rp.bucket)),
        headers: req.headers
    })
    .catch({ status: 404 }, function() {
        return hyper.get({
            uri: requestURI(rp, self._archiveName(rp.bucket)),
            headers: req.headers
        });
    });
};

ArchivalBucket.prototype.listRevisions = function(hyper, req) {
    var self = this;
    var rp = req.params;
    return hyper.get({
        uri: new URI([rp.domain, 'sys', 'key_rev_value', self._archiveName(rp.bucket), rp.key, '']),
        query: req.query
    });
};

ArchivalBucket.prototype.putRevision = function(hyper, req) {
    var self = this;
    var rp = req.params;
    return P.join(
        hyper.put({
            uri: requestURI(rp, self._latestName(rp.bucket)),
            headers: req.headers,
            body: req.body
        }),
        hyper.put({
            uri: requestURI(rp, self._archiveName(rp.bucket)),
            headers: req.headers,
            body: req.body
        })
    )
    .spread(function(res1) { return res1; });
};

module.exports = function(options) {
    var archivalBucket = new ArchivalBucket(options);

    return {
        spec: spec, // Re-export from spec module
        operations: {
            createBucket: archivalBucket.createBucket.bind(archivalBucket),
            listRevisions: archivalBucket.listRevisions.bind(archivalBucket),
            getRevision: archivalBucket.getRevision.bind(archivalBucket),
            putRevision: archivalBucket.putRevision.bind(archivalBucket)
        }
    };
};
