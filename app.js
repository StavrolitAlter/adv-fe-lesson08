var express = require('express');
var path = require('path');
var fs = require('fs');
var url = require('url');
var apiVersion = require('./package').version;

var app = express();

app.set('port', 5000);

app.listen(app.get('port'), function() {
	console.log('Node app is running on http://localhost:' + app.get('port'));
});

app.get('/', function(req, res) {
	var urlParsed = url.parse(req.url, true);

	console.log(urlParsed);

	res.send('<html><body><h1>My web app http API! Version ' + apiVersion + '</h1></body></html>');
});

app.all('/test/', function(req, res) {
	res.send('<html><body><h1>Hello test</h1></body></html>');
});

app.get('/api/' + apiVersion + '/*', function(req, res) {
	renderDataFromMocks(req, res);
});

app.delete('/api/' + apiVersion + '/*', function(req, res) {

	deleteDataFromMocks(req, res);
});

function renderDataFromMocks(req, res) {

	var normalRequestPath = req.path.replace('/' + apiVersion, '') + '/';

	var getFilePath = function(i) {
		return path.join(
			__dirname,
			normalRequestPath,
			(i / 1000).toFixed(3).replace(/.*\./, ''),
			req.method.toLowerCase() + '.json'
		);
	};

	var outerCount = 0;
	var allFilesPromises = [];

	try {
		while (fs.statSync(getFilePath(++outerCount))) {
			(function(innerCount) {

				var buffer = [];

				allFilesPromises.push(
					new Promise(function(resolve) {
						fs.createReadStream(getFilePath(innerCount))
							.on('end', function() {
								resolve({
									order: innerCount,
									value: Buffer.concat(buffer)
								});
							})
							.on('data', function(data) {
								buffer.push(data);
							})
							.on('error', function() {
								console.log('Reading ERROR:\n', getFilePath(innerCount));
							});
					})
				);

			})(outerCount);
		}
	} catch (e) {

		// If no data file is present
		if (outerCount === 1) {
			return res
				.status(404)
				.json([{
					'info': {
						'success': false,
						'code': 'No data file is present'
					}
				}])
				.end();
		}
	}

	Promise.all(allFilesPromises)
		.then(function(dataArray) {

			dataArray = dataArray.sort(function(a, b) {
				return a.order - b.order;
			}).reduce(function(previousArray, currentValue) {

				var arrayFromBuffer;

				try {
					arrayFromBuffer = JSON.parse(currentValue.value.toString());
					if (!Array.isArray(arrayFromBuffer)) {
						arrayFromBuffer = [arrayFromBuffer];
					}
				} catch (e) {
					arrayFromBuffer = [];
				}
				//console.log(arrayFromBuffer);
				return previousArray.concat(arrayFromBuffer);

			}, []);

			res.write(JSON.stringify(dataArray, null, 4));
			res.end();

		}, function() {
			console.log('One of the files exist, but failed to be read');
		});

}

function deleteDataFromMocks(req, res) {

	var normalRequestPath = req.path.replace('/' + apiVersion, '') + '/';

	var deleteFolderRecursive = function(path, isSecondRun) {

		try {
			if (fs.statSync(path)) {

				fs.readdirSync(path).forEach(function(file) {
					var curPath = path + "/" + file;
					if (fs.lstatSync(curPath).isDirectory()) { // recurse
						deleteFolderRecursive(curPath, true);
					} else { // delete file
						fs.unlinkSync(curPath);
					}
				});

				fs.rmdirSync(path);

				if (!isSecondRun) {
					res.setHeader('content-type', 'application/json');
					return res
						.status(200)
						.json([{
							'status': 'success'
						}])
						.end();
				}
			}
		} catch (e) {
			if (!isSecondRun) {
				return res
					.status(404)
					.json([{
						'status': 'fail'
					}])
					.end();
			}
		}

	};

	deleteFolderRecursive(path.join(__dirname, normalRequestPath));

}
