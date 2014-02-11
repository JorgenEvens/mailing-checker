var SEPARATOR = ';',
	PARSE_MAX = 10,
	PARSE_RESUME = 4,

	fs = require('fs'),
	dns = require('dns'),
	lines = require('line-by-line'),
	EventEmitter = require('events').EventEmitter,
	SMTPVerifyQueue = require('./SMTPVerifyQueue');

var Parser = function( file_in, file_out, options ) {
	options = options || {};

	this._in = new lines( file_in );
	this._out = fs.createWriteStream( file_out );
	this._domains = {};
	this._paused = false;

	this.PARSE_MAX = options.max_simultaneous || PARSE_MAX;
	this.PARSE_RESUME = options.resume_count || PARSE_RESUME;
	this.SEPARATOR = options.separator || SEPARATOR;

	this._in.on( 'line', this._handleLine.bind(this) );
	this._in.on( 'end', this._handleEnd.bind(this));
}

module.exports = exports = Parser;

Parser.prototype._parsing = function() {
	var q = SMTPVerifyQueue._mx,
		i = null,
		count = 0;

	for( i in q ) {
		i = q[i];

		count += i.pending();
	}

	return count;
}

Parser.prototype._handleLine = function( line ) {
	console.log( '[COUNT] ' + this._parsing() );

	if( this._parsing() >= this.PARSE_MAX && this._paused === false ) {
		this._paused = true;
		this._in.pause();
	}

	var me = this;

	setTimeout(function(){
		me.parseRecord( line.split( me.SEPARATOR ).slice(0, 1) );
	}, 1000 * Math.random() );
}

Parser.prototype._handleEnd = function() {
	var me = this;

	setTimeout(function(){
		if( me._parsing() > 0 )
			return me._handleEnd();

		me._out.close();
	}, 1000 );
}

Parser.prototype._handleVerification = function( record, message, code, line ) {
	this.resume();

	record[1] = message;
	record[2] = code;
	record[3] = line;

	this._out.write( record.join(';') + "\n" );
	console.log( "[CHECK] " + record[0] + "\t" + message + "\t" + code + "\t" + line );
}

Parser.prototype.error = function() {
	this.resume();

	arguments[0] = '[ERROR] ' + arguments[0];

	console.log.apply( console, arguments );
}

Parser.prototype.resume = function() {
	var me = this;

	if( this._parsing() < this.PARSE_RESUME && this._paused === true ) {
		this._paused = false;
		setImmediate(function() {
			me._in.resume();
		});
	}
}

Parser.prototype.parseRecord = function( record ) {
	var address = record[0].split('@'),
		domain = address[1],
		me = this;

	if( address.length != 2 )
		return this.error( 'Invalid address', address );

	if( typeof this._domains[domain] == 'undefined' ) {
		dns.resolveMx( domain, function( err, mx ) {
			if( err || mx.length===0 )
				return me.error( 'No MX for ' + domain + ': ' + ( err ? err.code : mx ) );

			var first = mx[0],
				i = null,
				queue = null;

			for( i in mx ) {
				i = mx[i];

				if( first.priority > i.priority ) {
					first = i;
				} else if( first.priority == i.priority && first.exchange < i.exchange ) {
					first = i;
				}
			}

			me._domains[domain] = SMTPVerifyQueue.load( first.exchange );

			me.dispatchCheck( domain, record );
		});
	} else {
		this.dispatchCheck( domain, record );
	}
}

Parser.prototype.dispatchCheck = function( domain, record ) {
	var me = this;
	this._domains[domain].push( record[0], function( message, code, line ) {
		me._handleVerification( record, message, code, line );
	});
}