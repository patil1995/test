//
// A simple iterative Test case execution framework written in NodeJS.
// -- Reads an excel file containing test cases in the form of
//    Given |  When   | Then   | Input   | Expected  | Func
//
//


var fs = require('fs');
var logger = require('log4js').getLogger();
var xlsx = require("node-xlsx");
var Promise = require('bluebird');
var colors = require('colors');
var _ = require('lodash');
var args = require("commander");
var config = require("./test_config.js");
if(config.doYouWantFileTheBugs === 'yes'){
  //  1. import 'openproject-package' as 'npm install -s ./path/to/openproject'
  //  2. intialize the 'opneproject-package'
  var openproject = require('openproject'); 
  openproject.init(config.openprojectConfig); 
}

printBanner();
logger.level = 'trace';

// Workaround for a problem with excel parsers and formats.
// sometimes the excel sheet contains empty rows but they are 
// recognized as iterable rows by the excel parser.  So, we end up
// iterating a whole bunch of 64k or (1 lac+) rows for nothing.
// To overcome this, we try to recognize, if there are more than
// n (generally n = 3) blank rows appearing consecutively.  if yes,
// we decide that the execution has reached eof.
var emptyRows = 0;
var prevEmpty = false;

args.version("1.0.0")
  .option("-i --id <testcase#>", "Optional - Id of the test case to run. Useful, if only one test case has to be executed.")
  .option("-x --exec <excel-file>", "Required - Path of the excel file containing test cases to execute")
  .option("-n --itrNo <iterationCount>", "Optional - The current iterationNo of the test case execution.")
  .parse(process.argv);


// Ensure we get minimum required arguments
if (args.exec == undefined) {
  args.help();
  process.exit(1);
}

if (args.id && isNaN(args.id)) {
  console.error("id should be a number.");
  process.exit(1);
} else { args.id = Number(args.id); }

if (args.itrNo && isNaN(args.itrNo)) {
  console.error("iterationNo(itrNo) should be a number.");
  process.exit(1);
} else { args.itrNo = Number(args.itrNo); }

logger.trace("Loading test cases...");
//var workbook = xlsx.parse("./data/iam-test-cases.xlsx");
logger.info("Reading test cases file: [", args.exec, "] ...");
var workbook = xlsx.parse(args.exec);
logger.trace("done with loading.");

// some global nonsense...
const startRow = 1;       // 0th row reserved for headings.
const startCol = 0;       // starts from left most, which is 'id' field.
const sheetIndex = 0;     // The worksheet that contains the test cases.
const inputColumn = 4;    // The column where input data is located in excel.
const expectedColumn = 5; // The column where expected data is located in excel.
const functorColumn = 6;  // The column where module definition is located in excel.

// Read the excel
debugger;
var tests = workbook[sheetIndex].data;
tests.splice(0, startRow);
var testStats = { passed:0, failed:0, skipped:0};

// if -i option was provided in cmdline, then
// find the test case id in the rows and accoridngly prepare
// the testcase rows sub-set.
if (args.id) {
  logger.info("Searching for the test case # %d...", args.id);
  if (args.id < 1 && args.id > tests.length) {
    logger.error("Test case number %d must be between 1 and %d.", args.id, tests.length);
    process.exit(2);
  }

  // copy the matching row tests[id], into a temp var and set it to tests array.
  var row = tests[args.id-1];
  tests = [];
  tests.push(row);
}

// Execute any pre-execution handler
var testHooks = require("./test_hooks.js");
//testHooks.before()
	execLoop()
  .then(function() { process.exit(0); })
	.catch(function(e) {
		console.error("Error : ", e);
		process.exit(1);
	});


/**
 *  Executes testcases present in the given excel file.
 **/
function execLoop() {
	// iterate through rows and calls the process executor for each row...
	return Promise.reduce(tests, executor, testStats)
	.then(function(stats) {
  	console.log("");
  	console.log("summary =>  passed:", stats.passed, " failed:", stats.failed, " skipped:", stats.skipped);
	});
}



///////////////////////////////////////////////////////////////////////
// Internal utility functions...
///////////////////////////////////////////////////////////////////////

function printBanner() {
  var data = fs.readFileSync("./banner.txt");
  console.log(data.toString());
}


function executor (accumulator, item, index, length) {
  logger.trace("executor: executing test case %d...", item[0]);
  if (item[0] == "EOF") {
    console.log("Finished execution.");
    return updateStats(accumulator);
  }

  return prepareTestCase(item)
          .then(exec)
          .then(compareResult)
          .then(printResult)
          .then(postBugToOpenproject)
          .then(updateStats.bind(null, accumulator))
          .catch(function(e) {
            logger.warn("Skipping test case %d due to error.", item[0]);
            //logger.warn("Skipping test case due to error.", e.toString());
            logger.warn("Skipping test case due to error.", e);
            return updateStats(accumulator);
          });
}

/**
 * Returns the name of the loadable module and function as a JSON,
 * from the given input string.
 * Tries to make best guess if the data is in JSON string or 
 * dot-notation format.
 *
 **/
function getModuleInfo(data) {
  if (data === undefined) return null;
  data = data.trim();
  if (data.length ===0) return null;
  try {
    // try to parse it as json. and return.
    logger.trace("Trying to parse the data as json...");
    var json = JSON.parse(data);
    return json;
  } catch (e) {
    logger.debug("The data is not a valid json. Trying if its dotted notation....");
    var arr = data.split(".");
    if (arr.length != 2) {
      logger.debug("Doesn't seem to be a dotted format string (module.func) either.");
      return null;
    }
    return { module: arr[0], func: arr[1] };
  }
}

/***
 *
 *  Computes the result of executing a function, against the expected result.
 *
 *  Note -> 
 *  1. If the exec function itself compared the expected Vs actual,
 *          then this function will just pass through (doing nothing).
 *  2. The default check done by this function is deep-equal-comparison of jsons'
 *
 *  @param {item} - an array containing test case information 
 *  @param {output} - result data as obtained by executing a function.
 *
 *  @returns {json} - a comparison result object, that can be fed to printResult
 *
***/
function compareResult (testcase) {
  if (testcase.result != undefined) return Promise.resolve(testcase);
  testcase.result = _.isEqual(testcase.expected, testcase.actual);
  return testcase;
}


/***
 * Prints results to stdout as a structured /formatted output.
***/
function printResult(testcase) {
  console.log("Test case id: ", testcase.id);
  console.log("   Given    :", testcase.given);
  console.log("   When     :", testcase.when);
  console.log("   Then     :", testcase.then);
  console.log("   Expected :", JSON.stringify(testcase.expected));
  console.log("   Actual   :", testcase.actual);
  console.log("   Result => ", testcase.result==true? "Pass".green.bold : "Fail".red.bold);

  return testcase;
}


/**
 * Takes an array defining a test case, and converts it to a 
 * testcase json object, so as to pass down the execution pipeline.
 **/
function prepareTestCase(testData) {
  var tc = {
      id:       testData[0],
      given:    testData[1],
      when:     testData[2],
      then:     testData[3],
      //expected: JSON.parse(testData[expectedColumn]),
      functor:  testData[functorColumn],
      result:   false     // by default fails, unless someone "passes" it.
  };

  // Check if more than or euqal to 3 rows are consecutively empty.
  // if so, we probably ran out of test cases.
  if (tc.id == "" && tc.given == "" && tc.when == "" && tc.then == "") {
    if (prevEmpty) emptyRows++; else prevEmty = true;
  } else { prevEmty = false; }

  if (prevEmty >= 3) return Promise.reject("EOF");
  
  try {
    tc.input = JSON.parse(testData[inputColumn]);
    tc.expected = JSON.parse(testData[expectedColumn]);
    return Promise.resolve(tc);
  } catch(e) {
    logger.warn("testcase (%d): JSON parse error for 'expected output' column.", testData[0]);
    tc.result = "skipped";
    return Promise.reject(tc);
  }
}


/**
 * Executes (invokes) a given <module>.<function>, and
 * fills in the results in "testcase.result" placeholder.
 **/
function exec(testcase) {

  // retrieve module name /func.  Load the module and call the func.
  var moduleData = getModuleInfo(testcase.functor);
  if (moduleData === null) {
    logger.trace("Ignoring test case %d, as no module/function provided...", index+1);
    return Promise.resolve(testcase);
  }
  

  var module = require(moduleData.module);
  if (module[moduleData.func]) {
    return module[moduleData.func](testcase);
  } else {
  
    logger.trace("No matching function \"%s\" found in \"%s\"", moduleData.func, moduleData.module);
    return Promise.reject();
  }

}


function updateStats(stats, testcase) {

  testcase = testcase || {};
  if (testcase.result && testcase.result == true)
    stats.passed = (stats.passed==undefined)?1:stats.passed+1;
  else if (testcase.result == false)
    stats.failed = (stats.failed==undefined)?1:stats.failed+1;
  else 
    stats.skipped = (stats.skipped==undefined)?1:stats.skipped+1;

  return stats;
}

//this function will post bug to 'opneproject' server
async function postBugToOpenproject(testcase){
  // doYouWantFileTheBugs === 'no' (or) testcase is passed(true), then don't post the bug to openproject
  if(config.doYouWantFileTheBugs === 'no' || testcase.result === true) return testcase;
  // doYouWantFileTheBugs === 'yes', post the bug to openproject
  // console.log("#####result: ", testcase)
  const payload = createPayloadToPostBug(testcase);
  var response = await openproject.createBug(payload);
  console.log("----------------------------------------------------------------------------------------------")
  if(response.id){
    console.log("response from OpenProject: ")
    console.log("\ncreated bug in : ", response._embedded.project.name)
    console.log("\ncreated bug with id: ", response.id)
  }else{
    console.log(" ==> response from OpenProject: ", response)
  }
  console.log("----------------------------------------------------------------------------------------------")
  return testcase;
}

function createPayloadToPostBug(testcase){
  let subject = "";
  if(args.itrNo) subject +=`IterationNo:${args.itrNo} __ `;
  subject += `ProjectName: ${config.openprojectConfig.projectName} __ Bugid:${testcase.id}`;
  
  const {given, when, then, expected, actual, result} = testcase;
  const rawdata = `
    given  : ${given}\n\n 
    when   : ${when}\n\n 
    then   : ${then}\n\n 
    expected  : ${JSON.stringify(expected)}\n\n
    actual    : ${JSON.stringify(actual)}\n\n
    result    : ${result}
    `;
  return {
    subject,
    description: {
      format: "application/json",
      raw: rawdata,
      html: rawdata
    },
    type:{
      "href": "/api/v3/types/7" //for 'bug', type_id is '7'
    },
    version: {
      href: '/api/v3/versions/12',
      title: 'Bugs Backlog'
    }
  };
}