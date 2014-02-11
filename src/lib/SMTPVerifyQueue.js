var SMTPClient = require('./SMTPClient'),
	SMTPVerifyQueue = function( mx ) {
		this._mx = mx;
		this._queue = [];
		this._active = false;
	};

module.exports = exports = SMTPVerifyQueue;

SMTPVerifyQueue.load = function( mx ) {
	if( !this._mx[mx] )
		this._mx[mx] = new SMTPVerifyQueue( mx );
	
	return this._mx[mx];
}

SMTPVerifyQueue._mx = [];

SMTPVerifyQueue.prototype.verify = function( recursion_key ) {
	var queue = this._queue,
		smtp = null,
		head = null,
		me = this;

	if( this._active && recursion_key != me._recursion_key ) return;
	this._active = true;
	if( queue.length < 1 ) {
		this._active = false;
		return;
	}

	head = queue.shift();

	smtp = new SMTPClient( this._mx, head.address, function( message, code, line ) {
		if( message == true )
			return setImmediate(function(){
				head.callback( message, code, line );
			});
		me._handleResponse( head, message, code, line );
	});
}

SMTPVerifyQueue.prototype._handleResponse = function( head, message, code, line ) {
	var me = this,
		i = null;

	for( i in this._handlers ) {
		if( this._handlers[i]( this, head, message, code, line ) )
			break;
	}

	setTimeout(function(){
		var key = Math.random() * 9999999;
		me._recursion_key = key;
		me.verify( key );
	}, 1000 + ( 9000 * Math.random() ) );
}

SMTPVerifyQueue.prototype._handlers = {
	temporaryFailure: function( me, head, message, code, line ) {
		if( code < 400 || code >= 500 )
			return false;

		if( head.attempt > 3 ) {
			return false;
		}

		var lcMessage = message.toLowerCase(),
			timeout = /((\d{1,2}:)?(\d{1,2}:)?\d{1,2})/.exec(lcMessage);

		// Greylisting might specify a timeout
		if( timeout == null ) {
			timeout = 15 * 60;
		} else {
			timeout = timeout.split(':');
			if( timeout.length == 3 ) {
				timeout = timeout[0] * 3600 + timeout[1] * 60 + timeout[2];
			} else if( timeout.length == 2 ) {
				timeout = timeout[0] * 60 + timeout[1];
			} else {
				timeout = timeout[0];
			}
		}

		setTimeout(function() {
			me.verify( head.address, head.callback, head.attempt + 1 );
		}, timeout * 1000);

		return true;
	},

	done: function( me, head, message, code, line ) {
		setImmediate(function(){
			head.callback( message, code, line );
		});

		return true;
	}
};

SMTPVerifyQueue.prototype.pending = function() {
	return this._queue.length;
}

SMTPVerifyQueue.prototype.push = function( address, callback ) {
	this._queue.push({
		address: address,
		callback: callback
	});
	setImmediate(this.verify.bind(this));
}