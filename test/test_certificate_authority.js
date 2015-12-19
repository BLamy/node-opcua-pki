/* global: it,describe */
require("requirish")._(module);

var path = require("path");
var async = require("async");
var fs = require("fs");
require("should");

var pki = require("index");
var toolbox = pki.toolbox;

describe("Certificate Authority", function () {

    this.timeout(400000);

    require("./helpers")(this);

    var options = {};
    var self;
    before(function () {

        self = this;
        options = {
            location: path.join(this.tmpFolder, "CA")
        };
    });

    it("should read openssl version", function (done) {

        toolbox.execute_openssl("version", {cwd: "."}, function (err) {
            done(err);
        });
    });

    it("should create a CertificateAuthority", function (done) {

        var ca = new pki.CertificateAuthority(options);

        ca.initialize(function (err) {
            done(err);
        });
    });


});

describe("Signing" ,function(){


    this.timeout(400000);
    require("./helpers")(this);

    var self;

    var ca,cm;

    before(function (done) {

        self = this;
        ca = new pki.CertificateAuthority({location: path.join(this.tmpFolder, "CA")});
        cm = new pki.CertificateManager({location: path.join(self.tmpFolder, "PI")});

        async.series([
            function(callback){ cm.initialize(callback); },
            function(callback){ ca.initialize(callback); }
        ],done);
    });

    function createCertificateRequest(callback) {

        // let create a certificate request
        var params = {
            applicationUri: "MY:APPLICATION:URI",
            // can only be TODAY due to openssl limitation : startDate: new Date(2010,2,2),
            duration: 365 * 7,
            dns: [
                "localhost",
                "my.domain.com"
            ],
            ip: [
                "192.123.145.121"
            ]
        };
        cm.createCertificateRequest(params, function (err, certificate_request) {
            callback(err, certificate_request);
        });

    }

    it("should sign a Certificate Request", function (done) {


        var self = this;
        self.certificate_request="";

        async.series([

            function(callback) {
                // create a Certificate Signing Request
                createCertificateRequest(function(err,certificate_request) {
                    self.certificate_request = certificate_request;
                    callback(err)
                })
            },

            function (callback) {

                fs.existsSync(self.certificate_request).should.eql(true);

                var certificate_filename = path.join(self.tmpFolder, "sample_certificate.pem");

                var params = {
                    applicationUri:  "BAD SHOULD BE IN REQUEST",
                    startDate: new Date(2011,25,12),
                    duration: 10* 365
                };

                ca.signCertificateRequest(certificate_filename,self.certificate_request,params,function(err, certificate) {
                    //xx console.log("Certificate = ",certificate);
                    fs.existsSync(certificate).should.eql(true);

                    //Serial Number: 4096 (0x1000)

                    // should have 2 x -----BEGIN CERTIFICATE----- in the chain

                    callback(err);
                });

            }


        ],done);
    });

    it("T2 - should create various Certificates signed by the CA authority", function (done) {


        var self = this;
        self.certificate_request="";

        var now = new Date();
        var last_year = new Date();
        last_year.setFullYear(now.getFullYear()-1);
        var next_year = (new Date());
        next_year.setFullYear(now.getFullYear()+1);

        function sign(startDate,duration,callback) {

            var a = toolbox.x509Date(startDate) + "_" + duration;

            fs.existsSync(self.certificate_request).should.eql(true);

            var certificate_filename = path.join(self.tmpFolder, "sample_certificate" + a + ".pem");

            var params = {
                applicationUri:  "BAD SHOULD BE IN REQUEST",
                startDate: startDate,
                duration: duration
            };

            ca.signCertificateRequest(certificate_filename,self.certificate_request,params,function(err, certificate) {

                console.log("Certificate = ",certificate);
                if (!err) {
                    fs.existsSync(certificate).should.eql(true);
                }
                //Serial Number: 4096 (0x1000)

                // should have 2 x -----BEGIN CERTIFICATE----- in the chain

                callback(err);
            });
        }
        async.series([

            function(callback) {
                // create a Certificate Signing Request
                createCertificateRequest(function(err,certificate_request) {
                    self.certificate_request = certificate_request;
                    callback(err)
                })
            },
            sign.bind(null,last_year, 1 * 200), // obsolete
            sign.bind(null,last_year, 10 * 365), // valid
            sign.bind(null,next_year, 1 *  365), // not started yet

        ],done);

    });

    it("T3 - should create various self-signed Certificates using the CA", function (done) {

        // using a CA to construct self-signed certificates provides the following benefits:
        //    - startDate can be easily specified in the past or the future
        //    - certificate can be revoked ??? to be checked.

        var privateKey = cm.privateKey;
        var certificate = path.join(self.tmpFolder,"sample_self_signed_certificate.pem");

        fs.existsSync(certificate).should.eql(false);
        ca.createSelfSignedCertificate(certificate,privateKey,{
            applicationUri: "SomeUri"
        },function(err) {
            fs.existsSync(certificate).should.eql(true);
            done();
        });
    });

});