// configuration for executing test cases...
var config = {
	prabhandhak : {
		 //url: "192.168.1.118:9130"
		url:"localhost:4680",
    auth:"localhost:7890"
	},
	database: {
  	"dburi": ["mongodb://192.168.1.118:27017"],
  	"db": [ "node_1", "node_2", "node_3","node_4","node_5","node_6","node_7"],
  	//"db" : [],
  	 	"collections" : [
      	"users",
      	"company"
  	]
	},
  doYouWantFileTheBugs: "no", //give 'yes'->to file the bugs. 'no'-> don't want to file the bugs
  openprojectConfig:{
    "hostip"    : "106.51.142.65",
    "endUri"    : "/api/v3",
    "port"      : "6020", // opneproject server address
    "username"  : "apikey", // As refered in 'Openproject documentation'
    "Authorization"  : "Basic YXBpa2V5OmY1ZGJkNmUxMzAyNmFjYTk4ODdiY2U0MmZiM2I0YzBjMDVlYjI2M2MyMmEwMTc2M2ViZmFmZTVjZGMyYmNjYWQ=",
    "projectId" : '3', // Human Milk Distribution
    "projectName": 'HMD_Authserver-v2',
    "versionid"   : '12' // versionName -> 'Bugs Backlog'
  }
};

module.exports = config;  
