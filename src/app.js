var Parser = require('./lib/Parser');

process.on('uncaughtException', function( err ){
	setImmediate(function(){
		console.log( err, 'Oh well!' );
		parser.resume();
	});
});

var parser = new Parser( 'LIMRELEX.csv', 'mailings_out.csv' );