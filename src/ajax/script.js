define([
	"../core",
	"../ajax"
], function( jQuery ) {

// Tell whether the browser sends a request for url to another origin than the document's.
// The crossDomain detection of jQuery.ajax parses urls with a regex that misses some the browser
// still resolves to another origin (leading whitespace, tabs, backslashes...), so ask the browser.
function isCrossOrigin( url ) {
	var originAnchor = document.createElement("a"),
		urlAnchor = document.createElement("a");

	// Support: IE<=11
	// IE throws on malformed urls, and may throw when reading location once
	// document.domain has been set (#8138); the browser cannot request those either
	try {
		originAnchor.href = location.href;
		urlAnchor.href = url;

		// Support: IE<=11
		// Anchor's host property isn't correctly set when its href is relative
		urlAnchor.href = urlAnchor.href;

		return originAnchor.protocol + "//" + originAnchor.host !==
			urlAnchor.protocol + "//" + urlAnchor.host;
	} catch( e ) {
		return false;
	}
}

// Prevent auto-execution of scripts when no explicit dataType was provided (See gh-2432)
jQuery.ajaxPrefilter(function( s ) {
	if ( s.crossDomain || isCrossOrigin( s.url ) ) {
		s.contents.script = false;
	}
});

// Install script dataType
jQuery.ajaxSetup({
	accepts: {
		script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"
	},
	contents: {
		script: /(?:java|ecma)script/
	},
	converters: {
		"text script": function( text ) {
			jQuery.globalEval( text );
			return text;
		}
	}
});

// Handle cache's special case and global
jQuery.ajaxPrefilter( "script", function( s ) {
	if ( s.cache === undefined ) {
		s.cache = false;
	}
	if ( s.crossDomain ) {
		s.type = "GET";
		s.global = false;
	}
});

// Bind script tag hack transport
jQuery.ajaxTransport( "script", function(s) {

	// This transport only deals with cross domain requests
	if ( s.crossDomain ) {

		var script,
			head = document.head || jQuery("head")[0] || document.documentElement;

		return {

			send: function( _, callback ) {

				script = document.createElement("script");

				script.async = true;

				if ( s.scriptCharset ) {
					script.charset = s.scriptCharset;
				}

				script.src = s.url;

				// Attach handlers for all browsers
				script.onload = script.onreadystatechange = function( _, isAbort ) {

					if ( isAbort || !script.readyState || /loaded|complete/.test( script.readyState ) ) {

						// Handle memory leak in IE
						script.onload = script.onreadystatechange = null;

						// Remove the script
						if ( script.parentNode ) {
							script.parentNode.removeChild( script );
						}

						// Dereference the script
						script = null;

						// Callback if not abort
						if ( !isAbort ) {
							callback( 200, "success" );
						}
					}
				};

				// Circumvent IE6 bugs with base elements (#2709 and #4378) by prepending
				// Use native DOM manipulation to avoid our domManip AJAX trickery
				head.insertBefore( script, head.firstChild );
			},

			abort: function() {
				if ( script ) {
					script.onload( undefined, true );
				}
			}
		};
	}
});

});
