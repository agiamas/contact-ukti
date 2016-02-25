'use strict';

var path = require('path');
var config = require('../../config');
var logger = require('../../lib/logger');
var regionFinder = require('../../lib/region-finder');
var EmailTemplate = require('email-templates').EmailTemplate;
var nodemailer = require('nodemailer');
var async = require('async');
var raven = require('raven');
var i18n = require('hof').i18n;

var ravenClient = new raven.Client(config.sentry.dsn);

var templatesDir = path.resolve(__dirname, 'templates');

var transport = config.email.auth.user === '' ?
  require('nodemailer-stub-transport') : require('nodemailer-smtp-transport');

var attachments = [
  {
    filename: 'govuk_logotype_email.png',
    path: path.resolve(__dirname, 'images', 'govuk_logotype_email.png'),
    cid: 'govuk_logotype_email'
  },
  {
    filename: 'org_crest.png',
    path: path.resolve(__dirname, 'images', 'org_crest.png'),
    cid: 'org_crest'
  },
  {
    filename: 'spacer.gif',
    path: path.resolve(__dirname, 'images', 'spacer.gif'),
    cid: 'spacer_image'
  }
];

function Emailer() {
  this.transporter = nodemailer.createTransport(transport({
    host: config.email.host,
    port: config.email.port,
    secure: false,
    auth: config.email.auth.user && config.email.auth.pass ? config.email.auth : null,
    ignoreTLS: config.email.auth.user && config.email.auth.pass ? false : true,
  }));
}

Emailer.prototype = {
  locali18n: null,

  send: function send(email, callback) {
    this.locali18n = i18n({
      path: path.resolve(
        __dirname, '..', '..', 'apps', email.template, 'translations', '__lng__', '__ns__.json'
      )
    });

    this.locali18n.on('ready', function locali18nLoaded() {
      var locals = {
        data: email.dataToSend,
        t: function t(text) {
          return this.locali18n.translate(text);
        }.bind(this)
      };
      var batch = [
        {
          template: new EmailTemplate(path.join(templatesDir, email.template, 'customer')),
          to: email.to,
          subject: email.subject,
          locals: locals
        }
      ];

      this.getCaseworkerEmail(email.dataToSend['enquiry-reason'], email.dataToSend['uk-postcode'],
        function caseworkerEmailCb(error, caseworkerEmail) {
          if (error) {
            return callback(error);
          }

          batch.push({
            template: new EmailTemplate(path.join(templatesDir, email.template, 'caseworker')),
            to: caseworkerEmail,
            subject: email.subject,
            locals: locals
          });

          this.sendBatch(batch, callback);
        }.bind(this)
      );
    }.bind(this));
  },

  sendBatch: function sendBatch(batch, callback) {
    async.each(batch, this.sendBatchItem.bind(this), function allSent(err) {
      if (err) {
        return callback(err);
      }
      callback();
    });
  },

  sendBatchItem: function sendBatchItem(item, next) {
    logger.verbose('Sending email:', item.subject);
    item.template.render(item.locals, function templateRender(err, results) {
      if (err) {
        return next(err);
      }

      this.transporter.sendMail({
        from: config.email.from,
        to: item.to,
        subject: item.subject,
        html: results.html,
        text: results.text,
        attachments: attachments
      }, function transportCallback(error, responseStatus) {
        if (error) {
          return next(error);
        }
        logger.info('Email sent:', item.subject);
        next(null, responseStatus);
      });
    }.bind(this));
  },

  getCaseworkerEmail: function getCaseworkerEmail(reason, postcode, callback) {
    if (reason === this.locali18n.translate('fields.enquiry-reason.options.investment.label')) {
      return callback(null, config.email.caseworker.investment);
    }

    if (reason === this.locali18n.translate('fields.enquiry-reason.options.bisops.label')) {
      return callback(null, config.email.caseworker.bizops);
    }

    if (reason === this.locali18n.translate('fields.enquiry-reason.options.dso.label')) {
      return callback(null, config.email.caseworker.dso);
    }

    if (reason === this.locali18n.translate('fields.enquiry-reason.options.events.label')) {
      return callback(null, config.email.caseworker.events);
    }

    if (
      (reason === this.locali18n.translate('fields.enquiry-reason.options.export.label') ||
        reason === this.locali18n.translate('fields.enquiry-reason.options.overseas-investment.label')) && postcode
    ) {
      return regionFinder
        .getByPostcode(postcode)
        .then(function regionSuccess(region) {
          if (!region.email) {
            return callback(new Error('No email contact for region'));
          }

          callback(null, region.email);
        }, function regionError(error) {
          // log warning to console and sentry
          logger.warn(error);
          ravenClient.captureMessage('Invalid postcode: ' + postcode, {
            level: 'warning'
          });

          // but return default email address
          callback(null, config.email.caseworker.default);
        });
    }

    callback(null, config.email.caseworker.default);
  }

};

module.exports = new Emailer();
