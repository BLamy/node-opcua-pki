// ---------------------------------------------------------------------------------------------------------------------
// node-opcua
// ---------------------------------------------------------------------------------------------------------------------
// Copyright (c) 2014-2015 - Etienne Rossignon - etienne.rossignon (at) gadz.org
// ---------------------------------------------------------------------------------------------------------------------
//
// This  project is licensed under the terms of the MIT license.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so,  subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
// Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
// ---------------------------------------------------------------------------------------------------------------------
"use strict";
var assert = require("better-assert");
var fs = require("fs");
var path = require("path");
var async = require("async");
var _ = require("underscore");

var toolbox = require("./certificate_toolbox");
var mkdir = toolbox.mkdir;
var displayTitle = toolbox.displayTitle;
var displaySubtitle = toolbox.displaySubtitle;
var execute_openssl = toolbox.execute_openssl;


var config = {
    certificateDir: "INVALID",
    pkiDir: "INVALID"
};


function construct_CertificateAuthority(done) {

    var self = this;
    // create the CA directory store
    //
    // PKI/CA
    //     |
    //     +-+> private
    //     |
    //     +-+> public
    //     |
    //     +-+> certs
    //     |
    //     +-+> crl
    //     |
    //     +-+> conf
    //     |
    //     +-f: serial
    //     +-f: crlnumber
    //     +-f: index.txt
    //

    var ca_rootDir = self.rootDir;

    mkdir(ca_rootDir);
    mkdir(path.join(ca_rootDir, "private"));
    mkdir(path.join(ca_rootDir, "public"));
    //Xx execute("chmod 700 private");

    mkdir(path.join(ca_rootDir, "certs"));
    mkdir(path.join(ca_rootDir, "crl"));
    mkdir(path.join(ca_rootDir, "conf"));

    var serial = path.join(ca_rootDir, "serial");
    if (!fs.existsSync(serial)) {
        fs.writeFileSync(serial, "1000");
    }

    var crlnumber = path.join(ca_rootDir, "crlnumber");
    if (!fs.existsSync(crlnumber)) {
        fs.writeFileSync(crlnumber, "1000");
    }

    var index_file = path.join(ca_rootDir, "index.txt");
    if (!fs.existsSync(index_file)) {
        fs.writeFileSync(index_file, "");
    }

    if (fs.existsSync(path.join(ca_rootDir, "private/cakey.pem")) && !config.forceCA) {
        // certificate already exists => do not overwrite
        console.log("CA private key already exists ... skipping");
        return done();
    }

    displayTitle("Create Certificate Authority (CA)");

    var index_file_attr = path.join(ca_rootDir, "index.txt.attr");
    if (!fs.existsSync(index_file_attr)) {
        fs.writeFileSync(index_file_attr, "unique_subject = no");
    }

    var ca_conf = self.configFile;
    if (1 || !fs.existsSync(ca_conf)) {
        var data = toolbox.configurationFileTemplate; // inlineText(configurationFile);
        data = data.replace(/%%ROOT_FOLDER%%/, toolbox.make_path(ca_rootDir));
        fs.writeFileSync(ca_conf, data);
    }


    //Xx console.log(" ROOT =".yellow, ca_rootDir.cyan);

    // http://www.akadia.com/services/ssh_test_certificate.html

    var subject = "/C=FR/ST=IDF/L=Paris/O=Local NODE-OPCUA Certificate Authority/CN=NodeOPCUA";



    toolbox.setEnv("OPENSSL_CONF", toolbox.make_path(self.configFile));
    var configOption = " -config conf/caconfig.cnf ";
    process.env.ALTNAME_URI = "";
    process.env.ALTNAME_DNS = "";
    process.env.ALTNAME_DNS_1 = "";
    var options = { cwd: ca_rootDir };


    var tasks = [

        displayTitle.bind(null, "Generate the CA private Key"),
        // The first step is to create your RSA Private Key. This key is a 2048 bit RSA key which is encrypted using
        // Triple-DES and stored in a PEM format so that it is readable as ASCII text.
        execute_openssl.bind(null, "genrsa -out private/cakey.pem 2048",options),

        displayTitle.bind(null, "Generate a certificate request for the CA key"),

        // Once the private key is generated a Certificate Signing Request can be generated.
        // The CSR is then used in one of two ways. Ideally, the CSR will be sent to a Certificate Authority, such as
        // Thawte or Verisign who will verify the identity of the requestor and issue a signed certificate.
        // The second option is to self-sign the CSR, which will be demonstrated in the next section
        execute_openssl.bind(null, "req -new" +
            " -text " +
            " -extensions v3_ca" +
            configOption +
            " -key private/cakey.pem " +
            " -out private/cakey.csr " +
            " -subj \"" + subject + "\"", options),

        //Xx // Step 3: Remove Passphrase from Key
        //Xx execute("cp private/cakey.pem private/cakey.pem.org");
        //Xx execute(openssl_path + " rsa -in private/cakey.pem.org -out private/cakey.pem -passin pass:"+paraphrase);

        displayTitle.bind(null, "Generate CA Certificate (self-signed)"),
        execute_openssl.bind(null, " x509 -req -days 3650 " +
            " -text " +
            " -extensions v3_ca" +
            " -extfile " + "conf/caconfig.cnf" +
            " -in private/cakey.csr " +
            " -signkey private/cakey.pem " +
            " -out public/cacert.pem", options),

        displaySubtitle.bind(null, "generate CRL (Certificate Revocation List)"),
        execute_openssl.bind(null, "ca -gencrl " + configOption + " -out crl/revocation_list.crl", options),

    ];

    async.series(tasks, done);

}

function CertificateAuthority(options) {
    assert(options.hasOwnProperty("location"));
    this.location = options.location;
}

CertificateAuthority.prototype.initialize = function (callback) {
    assert(_.isFunction(callback));
    construct_CertificateAuthority.call(this, callback);
};

CertificateAuthority.prototype.__defineGetter__("rootDir", function () {
    return this.location;
});

CertificateAuthority.prototype.__defineGetter__("configFile", function () {
    return path.join(this.rootDir, "./conf/caconfig.cnf");
});

CertificateAuthority.prototype.__defineGetter__("caCertificate", function () {
    // the Certificate Authority Certificate
    return toolbox.make_path(this.rootDir, "./public/cacert.pem");
});

CertificateAuthority.prototype.__defineGetter__("revocationList", function () {
    return toolbox.make_path(this.rootDir, "./crl/revocation_list.crl");
});

CertificateAuthority.prototype.__defineGetter__("caCertificateWithCrl", function () {
    return toolbox.make_path(this.rootDir, "./public/cacertificate_with_crl.pem");
});


CertificateAuthority.prototype.constructCACertificateWithCRL = function (callback) {


    var self = this;
    assert(_.isFunction(callback));

    var cacert_with_crl = self.caCertificateWithCrl;

    // note : in order to check if the certificate is revoked,
    // you need to specify -crl_check and have both the CA cert and the (applicable) CRL in your truststore.
    // There are two ways to do that:
    // 1. concatenate cacert.pem and crl.pem into one file and use that for -CAfile.
    // 2. use some linked
    // ( from http://security.stackexchange.com/a/58305/59982)

    if (fs.existsSync(self.revocationList)) {
        fs.writeFileSync(cacert_with_crl, fs.readFileSync(self.caCertificate) + fs.readFileSync(self.revocationList));
    } else {
        // there is no revocation list yet
        fs.writeFileSync(cacert_with_crl, fs.readFileSync(self.caCertificate));
    }
    console.log("        cacert_with_crl = ", cacert_with_crl);
    callback();

};

CertificateAuthority.prototype.constructCertificateChain = function(certificate_file,callback) {

    var self = this;

    assert(_.isFunction(callback));
    assert(fs.existsSync(certificate_file));
    assert(fs.existsSync(self.caCertificate));

    console.log("        certificate file :".yellow, certificate_file.cyan);
    // append
    fs.writeFileSync(certificate_file,
        fs.readFileSync(certificate_file)
        + fs.readFileSync(self.caCertificate)
        //xx + fs.readFileSync(config.crl_filename)
    );
    callback();
};


CertificateAuthority.prototype.createSelfSignedCertificate = function(certificate_file,private_key,params,callback) {

    var self = this;

    assert(typeof private_key === "string");
    assert(fs.existsSync(private_key));
    assert(_.isFunction(callback));

    if (!toolbox.check_certificate_filename(certificate_file,params)) { return callback(); }

    toolbox.adjustDate(params);
    toolbox.adjustApplicationUri(params);
    toolbox.processAltNames(params);

    var csr_file = certificate_file + "_csr";
    assert(csr_file);

    var options = {cwd: params.rootDir } ;
    var configOption = "";
    // this require OPENSSL_CONF to be set
    assert(fs.existsSync(process.env.OPENSSL_CONF));

    var tasks = [];
    tasks.push(displaySubtitle.bind(null, "- the certificate signing request"));
    tasks.push(execute_openssl.bind(null, "req -text " + configOption + " -batch -new -key " + private_key + " -out " + csr_file, {}));

    tasks.push(displaySubtitle.bind(null, "- creating the self signed certificate"));
    tasks.push(execute_openssl.bind(null, "ca " +
        " -selfsign " +
        " -keyfile " + private_key +
        " -startdate " + toolbox.x509Date(params.startDate) +
        " -enddate "   + toolbox.x509Date(params.endDate) +
        " -batch -out " + certificate_file + " -in " + csr_file, options));


    tasks.push(displaySubtitle.bind(null, "- dump the certificate for a check"));
    tasks.push(execute_openssl.bind(null, "x509 -in " + certificate_file + "  -dates -fingerprint -purpose -noout", {}));

    tasks.push(displaySubtitle.bind(null, "- verify self-signed certificate"));
    tasks.push(toolbox.execute_openssl_no_failure.bind(null, "verify -verbose -CAfile " + certificate_file + " " + certificate_file, options));

    async.series(tasks, callback);

};


/**
 *
 * @param certificate_file       {String} the certificate filename to generate
 * @param csr_file               {String} the certificate signing request
 * @param params                 {Object}
 * @param params.applicationUri  {String} the applicationUri
 * @param params.startDate       {Date}   startDate of the certificate
 * @param params.duration        {Number} duration in date
 * @param callback               {Function}
 */
CertificateAuthority.prototype.signCertificateRequest = function (certificate_file, csr_file, params, callback) {

    var self = this;
    assert(fs.existsSync(csr_file));
    assert(_.isFunction(callback));
    if (!toolbox.check_certificate_filename(certificate_file)) {
        return callback();
    }
    toolbox.adjustDate(params);
    toolbox.adjustApplicationUri(params);
    toolbox.processAltNames(params);

    var options = {cwd: self.rootDir};
    var configOption = " -config conf/caconfig.cnf ";

    // this require OPENSSL_CONF to be set
    assert(fs.existsSync(process.env.OPENSSL_CONF));

    var tasks = [];

    tasks.push(displaySubtitle.bind(null, "- then we ask the authority to sign the certificate signing request"));
    tasks.push(execute_openssl.bind(null, "ca " +
        configOption +
        " -startdate " + toolbox.x509Date(params.startDate) +
        " -enddate " + toolbox.x509Date(params.endDate) +
        " -batch -out " + certificate_file + " -in " + csr_file, options));


    tasks.push(displaySubtitle.bind(null, "- dump the certificate for a check"));
    tasks.push(execute_openssl.bind(null, "x509 -in " + certificate_file + "  -dates -fingerprint -purpose -noout", options));

    tasks.push(displaySubtitle.bind(null, "- construct CA certificate with CRL"));
    tasks.push(CertificateAuthority.prototype.constructCACertificateWithCRL.bind(self));

    // construct certificate chain
    //   concatenate certificate with CA Certificate and revocation list
    tasks.push(displaySubtitle.bind(null, "- construct certificate chain"));
    tasks.push(CertificateAuthority.prototype.constructCertificateChain.bind(self,certificate_file));

    // todo
    tasks.push(displaySubtitle.bind(null, "- verify certificate against the root CA"));
    tasks.push(CertificateAuthority.prototype.verifyCertificate.bind(self,certificate_file));

    async.series(tasks, function(err) {
        if (err) { return callback(err); }
        callback(null,certificate_file);
    });

};

CertificateAuthority.prototype.verifyCertificate = function(certificate_file,callback) {

    // openssl verify crashes on windows! we cannot use it reliably
    return callback();

    var self = this;

    var n = toolbox.make_path;
    var options = {cwd: self.rootDir};
    toolbox.setEnv("OPENSSL_CONF", toolbox.make_path(self.configFile));
    var configOption = " -config conf/caconfig.cnf ";
//xx    configOption +

    toolbox.execute_openssl_no_failure(
        "verify -verbose " +
        " -CAfile " + n(self.caCertificateWithCrl) +
        " " + n(certificate_file), options,callback);

};

exports.CertificateAuthority = CertificateAuthority;
