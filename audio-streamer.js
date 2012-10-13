//////////////////////////////////////////////////////////////////////////
// AudioStreamer - main module
//////////////////////////////////////////////////////////////////////////
//
// Main audio streaming api
/* ----------------------------------------------------------------------
													Object Structures
-------------------------------------------------------------------------
	var bufferData = {
		buffer: audioBuffer[channel][sample],
		numSamples: integer,
		numChannels: integer,
		isInterleaved: bool
	}
*/
//////////////////////////////////////////////////////////////////////////
// Node.js Exports
var globalNamespace = {};
(function (exports) {
	exports.createNewAudioStreamer = function( port ) {
		newAudioStreamer= new AudioStreamer( port );
		return newAudioStreamer;
	};
}(typeof exports === 'object' && exports || globalNamespace));


//////////////////////////////////////////////////////////////////////////
// Requires
var BinaryServer = require('binaryjs').BinaryServer;
var BinaryClient = require('binaryjs').BinaryClient;


//////////////////////////////////////////////////////////////////////////
// Namespace (lol)
var SHOW_DEBUG_PRINTS = true;
var log = function( a ) { if(SHOW_DEBUG_PRINTS) console.log(a); };				// A log function we can turn off
var exists = function(a) { return typeof(a) == "undefined" ? false : true; };	// Check whether a variable exists
var dflt = function(a, b) { 													// Default a to b if a is undefined
	if( typeof(a) === "undefined" ){ 
		return b; 
	} else return a; 
};


//////////////////////////////////////////////////////////////////////////
// Constructor
function AudioStreamer( port ) {	
	var self = this;
	
	this.server;			// Our server instance (only exists if we're the server)
	this.clients = [];		// Our list of clients (this.clients[0] is us when we're not the server)
	this.isServer = true;	// Set when we're a server, owning the port
	this.port = port;

	// Buffers 
	this.outgoingBuffers = [];	// Buffers we're sending out to the server
	this.incomingBuffers = [];	// Buffers we're getting from the server

	// We're going to try to create a server to stream audio. If another
	// AudioStreamer instance is already sitting on our port, we need to
	// connect to it. To do this, we try to create a server. If that fails, 
	// we fall back on acting as a client
	log( "Attempting to create server" );
	
	process.on('EADDRINUSE', function (err) {
		console.error(err);
	});		
	
	console.log( port );
	this.server = BinaryServer( {port: this.port} );
	
	this.server.on( "error", function( error ) {
		log( "Failed to start server " + error );		
		log( "Acting as a client" );		
		self.clients.push( new BinaryClient('ws://localhost:' + port) );		
		self.isServer = false;
	});		
	
	this.server.on( 'connection', function(client) {
		log( "Recieved connection from client" );		
		
		self.clients.push( client );
		
		client.on( 'stream', function(stream, meta) {
			stream.on( 'data', function(data) {
				self.incomingBuffers.push( data.buffer )
			});
		});
	});
	
	// We're going to check for new outgoing buffers as often as possible
	setInterval( function() {	
		if( self.outgoingBuffers.length > 0 ) {
			for( var iBuffer=0; iBuffer<self.outgoingBuffers.length; ++iBuffer ) {
				// Send our queued buffers out to all of our clients
				for( var iClient=0; iClient<self.clients.length; ++iClient ) {
					self.clients[iClient].send( {buffer: self.outgoingBuffers[iBuffer]} );
				} // end for each client
			} // end for each buffer
		
			// Clear the buffer queue
			self.outgoingBuffers.length = 0;
		}
	}, 0 );
} // end AudioStreamer()


//////////////////////////////////////////////////////////////////////////
// Our processing thread functionality
AudioStreamer.prototype.streamAudio = function( processBuffer, numSamples, numChannels ) {
	// We can't do any socket operations in here, because we assume we could be
	// on the processing thread of an application. We just store a copy of the
	// buffer we're passed, and queue it up to be sent to the server. We also
	// copy an incoming buffer (from the server) into the process buffer, if any
	// exist
	
	// Queue up this buffer to be sent out to the server
	this.outgoingBuffers.push( processBuffer );
	
	// If we have buffers coming in from the server, we need to add them into the
	// process buffer
	if( this.incomingBuffers.length > 0 ) {
		for( var iBuffer=0; iBuffer<this.incomingBuffers.length; ++iBuffer ) {
			for( var iChannel=0; iChannel<numChannels; ++iChannel ) {
				for( var iSample=0; iSample<numSamples; ++iSample ) {
					processBuffer[iChannel][iSample] = (processBuffer[iChannel][iSample] + this.incomingBuffers[iBuffer][iChannel][iSample]) * 0.5;
				} // end for each sample
			} // end for each channel
		} // end for each buffer
		
		// Clear the buffer queue
		this.incomingBuffers.length = 0;
	}
} // end AudioStreamer.streamAudio()