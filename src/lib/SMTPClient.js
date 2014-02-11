/**
 * Emits
 * line
 * valid
 */
var util = require('util'),
	net = require('net');

var EventEmitter = require('events').EventEmitter,
	SMTPClient = function( host, mail, valid_cb ) {
		var me = this;

		this.host = host;
		this._state = 'HELO';
		this._buffer = '';
		this._mail = mail;
		this._connection = net.connect({
			port: 25,
			host: host
		});

		this._lookup_timer = setTimeout(function(){
			me.error( 'Lookup timed out.', 100001, 'Lookup took longer than 2 minutes.' );
		}, 120 * 1000 );
		
		this._attachHandlers( valid_cb );
	}

util.inherits( SMTPClient, EventEmitter );
module.exports = exports = SMTPClient;

SMTPClient.prototype._attachHandlers = function( callback ) {
	this.on('valid', callback );
	this.on('line', this.talk.bind(this) );

	this._connection.on('error', function( err ){
		if( this._state == 'QUIT' || this._state == 'CLOSED' ) return;

		this.error( 'Unkown error occurred', 10000, err.message );
	}.bind(this));

	this._connection.on('timeout', function(){
		this.error( 'Timeout', 10000 );
	}.bind(this));

	this._connection.on('close', function( has_error ){
		if( !has_error ) return;
		this.error( 'Closed' );
	}.bind(this));

	this._connection.on('data', this.handle.bind(this) );
}

SMTPClient.prototype.handle = function( data ) {
	this._buffer += data.toString();

	setImmediate( this.parse.bind(this) );
}

SMTPClient.prototype.parse = function() {
	if( this._buffer.indexOf("\n") < 0 ) return;

	var lines = this._buffer.split("\n"),
		line = null,
		position = 0,
		me = this,
		count = lines.length - 1,
		i = null;

	for( i=0; i<count; i++ ) (function( line ) {
		setImmediate(function(){
			me.emit( 'line', line );
		});
		position += line.length + 1;
	}( lines[i] ));

	this._buffer = this._buffer.substring( position );
}

SMTPClient.prototype.talk = function( line ) {
	var parts = line.split( ' ' ),
		code = parseInt( parts[0] );

	this.states[this._state].bind(this)(line, code);
}

SMTPClient.prototype.close = function() {
	if( this._closed ) return;
	
	this._closed =  true;	
	this._connection.end( "QUIT\r\n" );

	clearTimeout( this._lookup_timer );

	setTimeout(function(){
		this._connection.removeAllListeners();
	}.bind(this),1000);
	this.removeAllListeners();
}

SMTPClient.prototype.error = function( message, code, line ) {
	if( this._closed ) return;

	this._state = 'CLOSED';
	this.emit( 'valid', message, code, line );
	this.close();
}

SMTPClient.prototype.states = {

	HELO: function( line, code ) {
		if( code != 220 )
			return this.error('No Helo', code, line );

		this._connection.write( "HELO office.3920.be\r\n" );
		this._state = 'FROM';
	},

	FROM: function( line, code ) {
		if( code != 250 && code != 220 )
			return this.error( 'Helo refused', code, line );

		this._connection.write( "MAIL FROM:<ict@3920.be>\r\n" );
		this._state = 'TO';
	},

	TO: function( line, code ) {
		if( code != 250 )
			return this.error( 'Sender refused', code, line );

		this._connection.write( "RCPT TO:<" + this._mail + ">\r\n" );
		this._state = "QUIT";
	},

	QUIT: function( line, code ) {
		if( code > 400 ) {
			return this.error( 'Address refused', code, line);
		}

		this.emit( 'valid', true );
		this.close();
	},

	CLOSED: function( line, code ) {}

}

/* SMTP CHAT
220 smtp.3920.be ESMTP Exim 4.80 Mon, 15 Jul 2013 11:24:13 +0200
HELO test-server
250 smtp.3920.be Hello test-server [91.183.124.160]
MAIL FROM:<ict@3920.be>   
250 OK
RCPT TO:<test@test.com>
550 relay not permitted
QUIT
 */