'use strict';

var util = require('util');
var BaseController = require('hof').controllers.base;

var StartController = function StartController() {
  BaseController.apply(this, arguments);
};

util.inherits(StartController, BaseController);

StartController.prototype.getValues = function getValues(req) {
  req.sessionModel.reset();
  BaseController.prototype.successHandler.apply(this, arguments);
};

module.exports = StartController;
