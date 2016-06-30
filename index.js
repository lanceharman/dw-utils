#!/usr/bin/env node
'use strict';

if (process.argv[0].match('node$')){
  process.argv.shift()
}


console.log('Arguments: ', process.argv);
if (process.argv.length < 3){
  console.log('Usage : ' + process.argv[0] + ' host version username');
  process.exit();
}

process.argv.shift();

var archiver = require('archiver');
var fs = require('fs');
var path = require('path');
var dwServer = require('dw-webdav');
var readlineSync = require('readline-sync');

var host = process.argv.shift();
var version = process.argv.shift();
var username = process.argv.shift();
var password;

try {
   password = readlineSync.question('Password: ', {hideEchoBack : true});
} catch (e){
  console.log('Cannot read password: ', e);
  process.exit(1);
}

var version_zip = new archiver.create('zip', { zlib: 2 });


var server = new dwServer(host, username, password);

var done = () => {
  console.log('done');
};

var progress = (p) => {
  if (p.done == true){
    process.stdout.write('\r\x1b[2KUploading:                ... ');
  } else {
    var date = new Date(null);
    date.setSeconds(p.eta); // specify value for SECONDS here
    var eta = '(' + date.toISOString().substr(14, 5) + ')';
    process.stdout.write('\r\x1b[2KUploading:                ... ' + p.percentage.toFixed(1) + '% ' + eta);
  }

}

server.auth()
  .catch((error) => {
    console.log('Invalid Username or Password');
    process.exit();
  })
  .then(() => {
    process.stdout.write("Deleting old files:       ... ");
    var d = server.delete(version).then(() => {
      done();
      process.stdout.write("Zipping local files:      ... ");
    });
    var z = new Promise((resolve, reject) => {
      version_zip.directory(path.resolve('./cartridges'), version);
      version_zip.on('end', resolve).on('error', reject);
      version_zip.finalize()
      .pipe(fs.createWriteStream(version + '.zip'));
    });
    return Promise.all([d,z]); // wait for next step until both are finished.
  })
  .then(done)
  .then(() => {
    return server.upload(version + '.zip', progress);
  })
  .then(() => {
    progress({done : true})
  })
  .then(done)
  .then(() => {
    process.stdout.write("Unzipping remote file:    ... ");
    return server.unzip(version + '.zip');
  })
  .then(done)
  .then(() => {
    process.stdout.write("Deleting temporary files: ... ");
    var wait = [];
    wait.push(server.delete(version + '.zip'));
    wait.push(new Promise((resolve, reject) => {
      fs.unlink(version + '.zip', function(error){
        if (error){
          reject(error);
        } else {
          resolve();
        }
      });
    }));
    return Promise.all(wait);
  })
  .then(done)
  .catch((error) => {
    console.log("Error: ", error);
  });

