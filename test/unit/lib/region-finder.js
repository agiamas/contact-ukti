'use strict';

var Q = require('q');
var _ = require('underscore');
var nock = require('nock');

var config = require('../../../config');
var regionFinder = require('../../../lib/region-finder');
var REGIONS = regionFinder.regions;


function regionPromiseAssertions(promise) {
  return [
    promise.should.eventually.be.an('object'),
    promise.should.eventually.have.property('name'),
    promise.should.eventually.have.property('email')
  ];
}


describe('Regional Office', function() {
  // set POSTCODE_API TO DUMMY ONE
  before(function() {
    config.postcodeApi = 'http://example.com';
  });

  describe('#getAll()', function() {
    it('returns all regional offices', function() {
      var promise = regionFinder.getAll();
      return promise.should.eventually.have.length(REGIONS.length);
    });
  });

  describe('#getByRegion(region)', function() {
    it('returns a regional office if the region is valid', function() {
      var promises = [];

      _.each(REGIONS, function(regionName) {
        var promise = regionFinder.getByRegion(regionName);
        promises.concat(regionPromiseAssertions(promise));
      });

      return Q.all(promises);
    });

    it('returns an error if the region is invalid', function() {
      var promise = regionFinder.getByRegion('Landon');
      return promise.should.be.rejectedWith('Invalid region');
    });
  });


  describe('#getByPostcode(postcode)', function() {
    it('returns a regional office if the postcode is valid', function() {
      var postcode = 'sw1a1aa';

      nock(config.postcodeApi)
        .get('/' + postcode)
        .reply(200, {
          status: 200,
          result: {
            'region': 'London'
          }
        });

      var promise = regionFinder.getByPostcode(postcode);
      return Q.all(regionPromiseAssertions(promise));
    });

    it('returns a regional office if postcode is in Wales, Scotland or Northern Ireland', function() {
      var postcode = 'sa54tg';

      nock(config.postcodeApi)
        .get('/' + postcode)
        .reply(200, {
          status: 200,
          result: {
            'region': null,
            'european_electoral_region': 'Wales'
          }
        });

      var promise = regionFinder.getByPostcode(postcode);
      return Q.all(regionPromiseAssertions(promise));
    });

    it('returns an error if the postcode is invalid', function() {
      var postcode = 'invalid';

      nock(config.postcodeApi)
        .get('/' + postcode)
        .reply(404, {
          status: 404
        });

      return regionFinder
        .getByPostcode(postcode)
        .should.be.rejectedWith('Invalid postcode');
    });

    it('returns an error if the postcode is invalid', function() {
      var postcode = 'invalid';

      nock(config.postcodeApi)
        .get('/' + postcode)
        .reply(200, {
          status: 404
        });

      return regionFinder
        .getByPostcode(postcode)
        .should.be.rejectedWith('Invalid postcode');
    });

    it('returns an error if the POSTCODE API time out', function() {
      var postcode = 'sw1a1aa';

      nock(config.postcodeApi)
        .get('/' + postcode)
        .replyWithError('ETIMEDOUT');

      return regionFinder
        .getByPostcode(postcode)
        .should.be.rejectedWith('ETIMEDOUT');
    });
  });
});
