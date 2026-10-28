/*
 * Headless runner for the jQuery QUnit browser suite (test/index.html).
 *
 * Upstream ran this suite only on TestSwarm (real browsers); `npm test` (grunt)
 * builds and lints but executes no unit test. This runner loads the suite in
 * headless Chrome via puppeteer, prints one PASS/FAIL/SKIP line per test and a
 * summary with the passed/failed counts, and exits non-zero on any failure or
 * if the suite does not finish.
 *
 * Usage: node test/seal-qunit-runner.js <url> [timeoutSeconds]
 */
"use strict";

var puppeteer = require( process.env.PUPPETEER_MODULE || "puppeteer" );

var url = process.argv[ 2 ],
	timeout = ( +process.argv[ 3 ] || 1800 ) * 1000;

// Tests that cannot pass in a current headless Chrome, whatever the jQuery code does.
var skipped = {
	"#14379 - jQuery.ajax() on unload":
		"Chrome 80+ forbids synchronous XHR during page dismissal (unload), so the " +
		"sync request the test fires from an unload handler always errors",
	"fractions (see #7730 and #7885)":
		"Chrome lays out in 1/64px LayoutUnits, so the 1000.1px absolute position the " +
		"test sets reads back as 999.984375 instead of the 1000 the 2014 browsers rounded to"
};

function hookQUnit( skipped ) {
	// Name any CSP violation (the support CSP test fails on one) in the log
	document.addEventListener( "securitypolicyviolation", function( e ) {
		console.log( "[qunit] CSP violation in " + location.pathname + ": " +
			e.violatedDirective + " blocked " + e.blockedURI + " at " +
			e.sourceFile + ":" + e.lineNumber + " sample: " + e.sample );
	} );

	if ( window !== window.top ) {
		return;
	}

	// qunit.js exports `test` onto window; wrap it to leave out the skipped tests
	var realTest;
	Object.defineProperty( window, "test", {
		configurable: true,
		get: function() {
			return realTest;
		},
		set: function( fn ) {
			realTest = function( name ) {
				if ( Object.prototype.hasOwnProperty.call( skipped, name ) ) {
					console.log( "[qunit] SKIP " + name + " -- " + skipped[ name ] );
					return;
				}
				return fn.apply( this, arguments );
			};
		}
	} );

	document.addEventListener( "DOMContentLoaded", function() {
		var QUnit = window.QUnit,
			failures = [];
		QUnit.log( function( d ) {
			if ( !d.result ) {
				failures.push( ( d.message || "" ) +
					( "expected" in d ? " | expected: " + String( d.expected ) +
						" | actual: " + String( d.actual ) : "" ) +
					( d.source ? " | " + d.source.split( "\n" )[ 0 ] : "" ) );
			}
		} );
		QUnit.testDone( function( d ) {
			console.log( "[qunit] " + ( d.failed ? "FAIL" : "PASS" ) + " " + d.module +
				": " + d.name + " (" + d.passed + "/" + d.total + " assertions)" );
			failures.forEach( function( f ) {
				console.log( "[qunit]     assertion failed: " + f );
			} );
			failures = [];
		} );
		QUnit.done( function( d ) {
			window.__sealQUnitDone = d;
		} );
	} );
}

( async function() {
	var browser = await puppeteer.launch( {
		headless: "new",
		executablePath: process.env.CHROME_PATH || undefined,
		args: [ "--no-sandbox", "--disable-dev-shm-usage" ],
		protocolTimeout: 600000
	} );
	var page = await browser.newPage();
	var testsRun = 0, testsFailed = 0, skippedLines = [];
	page.on( "console", function( msg ) {
		var text = msg.text();
		if ( text.indexOf( "[qunit] " ) === 0 ) {
			console.log( text.slice( 8 ) );
			if ( /^\[qunit\] (PASS|FAIL) /.test( text ) ) {
				testsRun++;
				if ( text.indexOf( "[qunit] FAIL" ) === 0 ) {
					testsFailed++;
				}
			} else if ( text.indexOf( "[qunit] SKIP" ) === 0 ) {
				skippedLines.push( text.slice( 8 ) );
			}
		}
	} );
	page.on( "dialog", function( dialog ) {
		console.log( "dialog dismissed: " + dialog.message() );
		dialog.dismiss();
	} );
	page.on( "pageerror", function( err ) {
		console.log( "page error: " + err.message );
	} );
	await page.evaluateOnNewDocument( hookQUnit, skipped );
	console.log( "Running " + url );
	await page.goto( url, { timeout: 120000 } );
	await page.waitForFunction( "window.__sealQUnitDone", { timeout: timeout, polling: 1000 } );
	var d = await page.evaluate( "window.__sealQUnitDone" );
	await browser.close();
	console.log( "" );
	console.log( "QUnit summary for " + url );
	console.log( "Tests: " + testsRun + " run, " + ( testsRun - testsFailed ) + " passed, " +
		testsFailed + " failed, " + skippedLines.length + " skipped" );
	console.log( "Assertions: " + d.total + " total, " + d.passed + " passed, " +
		d.failed + " failed (" + d.runtime + " ms)" );
	console.log( "Skipped tests (not run, with reason):" );
	skippedLines.forEach( function( line ) {
		console.log( "  " + line );
	} );
	process.exit( d.failed || testsFailed || !testsRun ? 1 : 0 );
} )().catch( function( err ) {
	console.error( err );
	process.exit( 2 );
} );
