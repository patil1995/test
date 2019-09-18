// Executes before() hook for cleaning up data from mongodb
var config = require("./test_config.js");
var logger = require('log4js').getLogger();
var Mongo = require("mongodb").MongoClient;
var ObjectId = require('mongodb').ObjectID;
var Server = require('mongodb').Server;

var url = config.database.dburi ;  //+ "/" + config.database.db;

var conn = null;


module.exports = {
	before: function() {
		logger.trace("Connecting to MognoDB and cleaning up...");
		
		// Connect to MongoDB and clean up all records
		//return mongo.connect(url).then(function(db) {
		//return getConnection().then(function(conn) {
		// open the database and drop it.
		var ip_add = config.database.dburi.map(function(ip){
			return config.database.db.map(function(item) {
					console.log("Droping db from this "+ip+" address and db name is "+ item);
					var url =	ip + "/" + item;
					console.log(url)
					return Mongo.connect(url).then(function(conn) {
						return conn.dropDatabase();
					});
			});
		});
		var promises = [];
		ip_add.forEach(function(item){
			item.forEach(function(i){
				promises.push(i);
			})
		})
		console.log(promises);
		logger.trace("Finished with cleanup. Returning...");
		
		
		return Promise.all(promises)
						.catch(function(e) {
							logger.error("before(): Error while cleaning up: ", e.toString());
							throw e;
						});
	

		/*var promises = config.database.db.map(function(item) {
				var url = config.database.dburi + "/" + item;
				return Mongo.connect(url).then(function(conn) {
					return conn.dropDatabase();
				})
			});
			logger.trace("Finished with cleanup. Returning...");
			return Promise.all(promises).catch(function(e) {
				logger.error("before(): Error while cleaning up: ", e.toString());
				throw e;
		});*/
	},
	getPreRegId: function(passedId){
		return getConnection().then(function(conn) {
			var collection = conn.collection("users_master");
			var result = collection.findOne({
      	id: passedId 
      	//_id : new ObjectId(passedId)
   		}).then(function(result) {
	   		console.log("getPreRegId(): result: ", result);
	   		return result;   			
   		}).catch(function(e) {
	   		console.error("getPreRegId(): error: ", e);
	   		throw e;
   		})

   	})
	},

	setStatus: function (userId, statusVal) {
		return getConnection().then(function(conn) {
			var collection = conn.collection("users_master");
			return collection.updateOne( { id : userId},
								{ $set: { status: statusVal} });
		})
	}
}

/////////////////////////////////////////////////////////
// Internal functions...
/////////////////////////////////////////////////////////
function getConnection() {
	// if we already connected to mongodb server, just return
	// the stored connection db object, instead of re-connecting.
	if (conn != null) return Promise.resolve(conn);

	// Now, we are connecting for the first time...
	//conn = mongo.connect(url);
	//var client = new Mongo(new Server(config.database.host, config.database.port));
	//return client.open();
}

