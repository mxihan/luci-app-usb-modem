'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function element(tag, attrs, children) {
	if (arguments.length === 1)
		return { tag: tag, attrs: {}, children: [] };

	return {
		tag: tag,
		attrs: attrs || {},
		children: Array.isArray(children) ? children : [ children ]
	};
}

function loadView(exec) {
	let exported;
	const source = fs.readFileSync(path.join(__dirname,
		'../htdocs/luci-static/resources/view/usbmodem/status.js'), 'utf8');
	const context = {
		_: function(s) { return s; },
		E: element,
		L: { bind: function(fn, self) { return fn.bind(self); } },
		view: { extend: function(spec) { exported = spec; return spec; } },
		fs: { exec: exec || function() { return Promise.resolve({ code: 0, stdout: '{}' }); } },
		ui: {},
		poll: { add: function() {} },
		dom: { content: function() {} },
		document: { getElementById: function() { return null; } },
		window: { setTimeout: setTimeout },
		console: console
	};

	vm.createContext(context);
	vm.runInContext("String.prototype.format = function() { var a = arguments; var i = 0; return this.replace(/%s/g, function() { return a[i++]; }); };", context);
	vm.runInContext('(function() {\n' + source + '\n}());', context, { filename: 'status.js' });

	return exported;
}

async function expectReject(promise, pattern) {
	let error;
	try {
		await promise;
	}
	catch (err) {
		error = err;
	}
	assert.ok(error, 'expected promise to reject');
	assert.match(String(error.message || error), pattern);
}

async function main() {
	let view = loadView();
	assert.doesNotThrow(function() { view.renderStatus(undefined); });
	assert.doesNotThrow(function() { view.renderStatus({}); });
	assert.doesNotThrow(function() { view.renderStatus({ controller: {} }); });
	assert.match(JSON.stringify(view.renderStatus({ loadError: 'Object not found' })), /Object not found/);
	const incomplete = JSON.stringify(view.renderStatus({
		diagnosis: { healthy: true, message: 'Everything is fine' }
	}));
	assert.match(incomplete, /incomplete/i);
	assert.doesNotMatch(incomplete, /Everything is fine/);

	view = loadView(function() { return Promise.resolve({ code: 0, stdout: '' }); });
	await expectReject(view.loadStatus(), /empty|invalid/i);

	view = loadView(function() { return Promise.resolve({ code: 0, stdout: '[]' }); });
	await expectReject(view.loadStatus(), /invalid/i);

	view = loadView(function() { return Promise.reject(new Error('Object not found')); });
	const result = await view.load();
	assert.match(result.loadError, /status helper.*Object not found/i);

	console.log('status view tests passed');
}

main().catch(function(err) {
	console.error(err);
	process.exitCode = 1;
});
